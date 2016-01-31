// Both popup and background scripts share localstorage.

// Bug: When options page is embedded in chrome://extensions/ , it sometimes comes up blank at first.
//   https://code.google.com/p/chromium/issues/detail?id=550217



/**
 * Logs a debug message, via the background page.
 *
 * Messages will appear in the console of the background page (which is opened via "chrome://extensions/").
 */
function logDebug(message) {
	chrome.extension.getBackgroundPage().logDebug(message);
}



function setStatusText(s) {
	var statusDiv = document.getElementById("status-div");
	statusDiv.textContent = (s != null && s != "" ? s : "\u200b");  // Unicode zer-width space.
}



/**
 * Sets up an input field to trigger a callback after user editing, once idle.
 *
 * @param {string} name - A unique id for use among timed field methods.
 * @param {HTMLElement} node - An input element with a mutable value attribute.
 * @param {Object} callback - A delayed function to call, accepting the final value as an arg.
 */
function registerTimedField(name, node, callback) {
	if (timedFieldsState.hasOwnProperty(name)) abortTimedField(name);

	timedFieldsState[name] = {"node":node, "timer_id":-1, "last_value":null, "callback":callback};
}

/**
 * Begins or postpones the countdown of a timed field.
 *
 * @param {string} name - A unique id for use among timed field methods.
 * @param {string} value - A new pending value.
 */
function pokeTimedField(name, value) {
	fieldState = timedFieldsState[name];
	if (fieldState["timer_id"] == -1 && value === fieldState["last_value"]) return;

	if (fieldState["timer_id"] != -1) window.clearTimeout(fieldState["timer_id"]);

	fieldState["timer_id"] = window.setTimeout(function() {
		fieldState["timer_id"] = -1;
		fieldState["callback"](value);
	}, 1000);
}

/**
 * Aborts the countdown of a timed field.
 *
 * @param {string} name - A unique id for use among timed field methods.
 */
function abortTimedField(name) {
	fieldState = timedFieldsState[name];
	if (fieldState["timer_id"] != -1) {
		window.clearTimeout(fieldState["timer_id"]);
		fieldState["timer_id"] = -1;
	}
}

/**
 * Quietly sets the value of a timed field.
 *
 * Any running countdown will be aborted. No callback will trigger.
 *
 * @param {string} name - A unique id for use among timed field methods.
 * @param {string} value - A new value.
 */
function setTimedField(name, value) {
	abortTimedField(name);
	fieldState = timedFieldsState[name];
	fieldState["last_value"] = value;
	fieldState["node"].value = value;
}



var timedFieldsState = {};  // Dict of name:{node, timer_id, last_value, callback}

var optionsState = {};
optionsState["redacting_vanilla_box"] = null;
optionsState["redacting_tweetdeck_box"] = null;
optionsState["request_pin_btn"] = null;
optionsState["input_pin_field"] = null;
optionsState["submit_pin_btn"] = null;
optionsState["twitter_actions_fieldset"] = null;
optionsState["test_credentials_btn"] = null;
optionsState["fetch_block_list_btn"] = null;
optionsState["fetch_interval_field"] = null;

var backgroundPort = chrome.runtime.connect({"name":"options"});



backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.type == "set_redacting_vanilla") {
			var b = Boolean(message.value);
			optionsState["redacting_vanilla_box"].checked = b;
		}
		else if (message.type == "set_redacting_tweetdeck") {
			var b = Boolean(message.value);
			optionsState["redacting_tweetdeck_box"].checked = b;
		}
		else if (message.type == "set_block_list_fetch_interval") {
			setTimedField("fetch_interval_field", message.value);
		}
		else if (message.type == "set_twitter_ready") {
			optionsState["twitter_actions_fieldset"].disabled = !Boolean(message.value);

			var span = document.getElementById("twitter-ready-text");
			span.textContent = ""+Boolean(message.value);
		}
		else if (message.type == "set_block_list_description") {
			var span = document.getElementById("block-list-text");
			span.textContent = (message.value != null ? message.value : "");
		}
		else if (message.type == "set_status_text") {
			var status = message.value;
			if (status != null) {
				var timeStr = new Date(status.when).toLocaleTimeString();
				setStatusText("@ "+ timeStr +" -> "+ status.text);
			} else {
				setStatusText(null);
			}
		}
	}
);



document.addEventListener("DOMContentLoaded", function() {
	optionsState["redacting_vanilla_box"] = document.getElementById("redacting-vanilla-box");
	optionsState["redacting_tweetdeck_box"] = document.getElementById("redacting-tweetdeck-box");
	optionsState["request_pin_btn"] = document.getElementById("request-pin-btn");
	optionsState["input_pin_field"] = document.getElementById("input-pin-field");
	optionsState["submit_pin_btn"] = document.getElementById("submit-pin-btn");
	optionsState["twitter_actions_fieldset"] = document.getElementById("twitter-actions-fieldset");
	optionsState["test_credentials_btn"] = document.getElementById("test-credentials-btn");
	optionsState["fetch_block_list_btn"] = document.getElementById("fetch-block-list-btn");
	optionsState["fetch_interval_field"] = document.getElementById("fetch-interval-field");

	optionsState["redacting_vanilla_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redacting_vanilla", "value":Boolean(optionsState["redacting_vanilla_box"].checked)});
	});

	optionsState["redacting_tweetdeck_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redacting_tweetdeck", "value":Boolean(optionsState["redacting_tweetdeck_box"].checked)});
	});

	optionsState["request_pin_btn"].addEventListener("click", function() {
		backgroundPort.postMessage({type:"request_twitter_pin"});
	});

	optionsState["submit_pin_btn"].addEventListener("click", function() {
		var pin = optionsState["input_pin_field"].value;
		if (pin) {
			backgroundPort.postMessage({type:"submit_twitter_pin", "value":pin});
		} else {
			setStatusText("Request a PIN. Twitter will give you a number to paste here. Then click OK.");
		}
	});

	optionsState["test_credentials_btn"].addEventListener("click", function() {
		backgroundPort.postMessage({type:"verify_twitter_credentials"});
	});

	optionsState["fetch_block_list_btn"].addEventListener("click", function() {
		backgroundPort.postMessage({type:"fetch_block_list"});
	});

	registerTimedField("fetch_interval_field", optionsState["fetch_interval_field"],
		function(value) {
			backgroundPort.postMessage({type:"set_block_list_fetch_interval", "value":value});
		}
	);

	optionsState["fetch_interval_field"].addEventListener("input", function() {
		// Number-type input fields filter non-float characters.
		// This event fires frivilously, even on banned chars. Or held-mouse inc/dec.
		// Not triggered by programmatic edits.
		var origInterval = optionsState["fetch_interval_field"].value;
		var newInterval = origInterval.replace(/[^0-9]/g, "");  // Regex out any sign/decimal.

		optionsState["fetch_interval_field"].value = newInterval;

		pokeTimedField("fetch_interval_field", newInterval);
	});

	backgroundPort.postMessage({type:"init_options"});
});
