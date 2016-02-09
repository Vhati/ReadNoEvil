// Both popup and background scripts share localstorage.

// Bug: When options page is embedded in chrome://extensions/ , it sometimes comes up blank at first.
//   https://code.google.com/p/chromium/issues/detail?id=550217

RNE.logging.setUseBackgroundConsole(true);
RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



function setStatusText(s) {
	var statusDiv = document.getElementById("status-div");
	statusDiv.textContent = (s != null && s != "" ? s : "\u200b");  // Unicode zero-width space.
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



function setHintVisible(id, b) {
	var methodName;

	var hintPara = document.getElementById(id);

	methodName = (!b ? "add" : "remove");
	hintPara.classList[methodName]("invisible");

	var hintSeparator = document.getElementById("hints-separator");
	var visibleHints = document.querySelectorAll("#hints-separator ~ .hint:not(.invisible)");

	methodName = (visibleHints.length == 0 ? "add" : "remove");
	hintSeparator.classList[methodName]("invisible");
}



var timedFieldsState = {};  // Dict of name:{node, timer_id, last_value, callback}

var optionsState = {};
optionsState["redacting_vanilla_box"] = null;
optionsState["redacting_tweetdeck_box"] = null;
optionsState["observing_you_block_box"] = null;
optionsState["hooking_menus_box"] = null;
optionsState["redaction_style_combo"] = null;
optionsState["request_pin_btn"] = null;
optionsState["pin_field"] = null;
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
		else if (message.type == "set_observing_you_block") {
			var b = Boolean(message.value);
			optionsState["observing_you_block_box"].checked = b;
		}
		else if (message.type == "set_hooking_menus") {
			var b = Boolean(message.value);
			optionsState["hooking_menus_box"].checked = b;
		}
		else if (message.type == "set_redaction_style") {
			var name = message.value;
			var namedOption = optionsState["redaction_style_combo"].options.namedItem(name);
			if (namedOption) {
				namedOption.selected = true;
			} else {
				RNE.logging.warning("Options page has no option for redaction style: "+ message.value);
			}
		}
		else if (message.type == "set_block_list_fetch_interval") {
			setTimedField("fetch_interval_field", message.value);
		}
		else if (message.type == "set_twitter_ready") {
			var b = Boolean(message.value);
			optionsState["twitter_actions_fieldset"].disabled = !b;

			var span = document.getElementById("twitter-ready-text");
			span.textContent = ""+b;

			setHintVisible("twitter-setup-hint", !b);
		}
		else if (message.type == "set_block_list_description") {
			var span = document.getElementById("block-list-text");
			span.textContent = (message.value != null ? message.value : "");

			setHintVisible("block-list-fetch-hint", (message.count == 0));
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
	optionsState["observing_you_block_box"] = document.getElementById("observing-you-block-box");
	optionsState["hooking_menus_box"] = document.getElementById("hooking-menus-box");
	optionsState["redaction_style_combo"] = document.getElementById("redaction-style-combo");
	optionsState["request_pin_btn"] = document.getElementById("request-pin-btn");
	optionsState["pin_field"] = document.getElementById("pin-field");
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

	optionsState["observing_you_block_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_observing_you_block", "value":Boolean(optionsState["observing_you_block_box"].checked)});
	});

	optionsState["hooking_menus_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_hooking_menus", "value":Boolean(optionsState["hooking_menus_box"].checked)});
	});

	optionsState["redaction_style_combo"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redaction_style", "value":optionsState["redaction_style_combo"].value});
	});

	optionsState["request_pin_btn"].addEventListener("click", function() {
		backgroundPort.postMessage({type:"request_twitter_pin"});
	});

	optionsState["submit_pin_btn"].addEventListener("click", function() {
		var pin = optionsState["pin_field"].value;
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
