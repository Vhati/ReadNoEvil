// Both popup and background scripts share localstorage.

// Bug: When options page is embedded in chrome://extensions/ , it sometimes comes up blank at first.
//   https://code.google.com/p/chromium/issues/detail?id=550217


var optionsDebug = true;  // Edit this to toggle logging/alerts.



/**
 * Logs a message.
 *
 * Edit the "optionsDebug" global var to toggle logging.
 *
 * Messages will appear in the console of the background page (which is opened via "chrome://extensions/").
 */
function optionsLog(message) {
	if (popupDebug) {
		chrome.extension.getBackgroundPage().console.log(message);
	}
}



function setStatusText(s) {
	var statusDiv = document.getElementById("status-div");
	statusDiv.textContent = (s != null ? s : "");
}



var optionsState = {};
optionsState["redacting_box"] = null;
optionsState["request_pin_btn"] = null;
optionsState["input_pin_field"] = null;
optionsState["submit_pin_btn"] = null;
optionsState["twitter_actions_fieldset"] = null;
optionsState["test_credentials_btn"] = null;
optionsState["fetch_block_list_btn"] = null;

var backgroundPort = chrome.runtime.connect({"name":"options"});



backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.type == "set_redacting") {
			var b = Boolean(message.value);
			optionsState["redacting_box"].checked = b;
		}
		else if (message.type == "set_twitter_ready") {
			optionsState["twitter_actions_fieldset"].disabled = !Boolean(message.value);
		}
		else if (message.type == "set_status_text") {
			setStatusText(message.value);
		}
	}
);



document.addEventListener("DOMContentLoaded", function() {
	optionsState["redacting_box"] = document.getElementById("redacting-box");
	optionsState["request_pin_btn"] = document.getElementById("request-pin-btn");
	optionsState["input_pin_field"] = document.getElementById("input-pin-field");
	optionsState["submit_pin_btn"] = document.getElementById("submit-pin-btn");
	optionsState["twitter_actions_fieldset"] = document.getElementById("twitter-actions-fieldset");
	optionsState["test_credentials_btn"] = document.getElementById("test-credentials-btn");
	optionsState["fetch_block_list_btn"] = document.getElementById("fetch-block-list-btn");

	optionsState["redacting_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redacting", "value":Boolean(optionsState["redacting_box"].checked)});
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


	backgroundPort.postMessage({type:"init_options"});
});
