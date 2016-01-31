// Both popup and background scripts share localstorage.
// To get a console window, right-click the icon and "inspect popup".


var popupDebug = true;  // Edit this to toggle logging/alerts.



/**
 * Logs a message.
 *
 * Edit the "popupDebug" global var to toggle logging.
 *
 * Messages will appear in the console of the background page (which is opened via "chrome://extensions/").
 */
function popupLog(message) {
	if (popupDebug) {
		chrome.extension.getBackgroundPage().console.log(message);
	}
}



var popupState = {};
popupState["redacting_vanilla_box"] = null;
popupState["redacting_tweetdeck_box"] = null;
popupState["redact_all_box"] = null;

var backgroundPort = chrome.runtime.connect({"name":"popup"});



backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message.type == "set_redacting_vanilla") {
			var b = Boolean(message.value);
			popupState["redacting_vanilla_box"].checked = b;
		}
		else if (message.type == "set_redacting_tweetdeck") {
			var b = Boolean(message.value);
			popupState["redacting_tweetdeck_box"].checked = b;
		}
		else if (message.type == "set_redact_all") {
			var b = Boolean(message.value);
			popupState["redact_all_box"].checked = b;
		}
	}
);



document.addEventListener("DOMContentLoaded", function() {
	popupState["redacting_vanilla_box"] = document.getElementById("redacting-vanilla-box");
	popupState["redacting_tweetdeck_box"] = document.getElementById("redacting-tweetdeck-box");
	popupState["redact_all_box"] = document.getElementById("redact-all-box");

	popupState["redacting_vanilla_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redacting_vanilla", "value":Boolean(popupState["redacting_vanilla_box"].checked)});
	});

	popupState["redacting_tweetdeck_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redacting_tweetdeck", "value":Boolean(popupState["redacting_tweetdeck_box"].checked)});
	});

	popupState["redact_all_box"].addEventListener("change", function() {
		backgroundPort.postMessage({"type":"set_redact_all", "value":Boolean(popupState["redact_all_box"].checked)});
	});

	backgroundPort.postMessage({type:"init_popup"});
});
