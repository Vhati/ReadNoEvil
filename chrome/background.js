// To get a console window, visit chrome://extensions/ and click "background page".


var backgroundDebug = true;  // Edit this to toggle logging/alerts.



/**
 * Logs a message.
 *
 * Edit the "backgroundDebug" global var to toggle logging.
 *
 * Messages will appear in the console of the background page (which is opened via "chrome://extensions/").
 */
function backgroundLog(message) {
	if (backgroundDebug) {
		console.log(message);
	}
}



function backgroundInit() {
	chrome.storage.local.get(
		["redacting", "block_list_timestamp", "block_list"],
		function(data) {
			if (chrome.runtime.lasterror) {
				backgroundLog(chrome.runtime.lastError.message);
			}

			var new_block_list;
			var new_block_list_timestamp;

			if (data.block_list) {
				new_block_list = data.block_list;

				if (data.block_list_timestamp) {
					new_block_list_timestamp = data.block_list_timestamp;
				} else {
					new_block_list_timestamp = Date.now();
				}
			}
			else {
				new_block_list = [];
				new_block_list_timestamp = Date.now();
			}

			setRedacting(Boolean(data.redacting), false);
			setBlockList(new_block_list, new_block_list_timestamp, false);
		}
	);
}



/**
 * Handles messages from the other scripts in this extension.
 *
 * This isn't actually a function, but I'll comment anyway, as if were valid for JSDoc.
 *
 * show_page_action:
 *   Displays this extension's clickable icon, in the address bar.
 *
 * test_evilness:
 *   param {string[]} message.userIds - A list of users to check against the black_list.
 *   returns {Object.<string, Boolean>} - A dict of key:value pairs. True if on the list.
 *
 * get_storage:
 *   param {string[]} message.keys - A list of localstorage keys to look up.
 *   returns {Object.<string, Object>} - A dict of key:value pairs.
 *
 * Options pages have no tabId and do not support sendResponse. :/
 * They CAN, however, request info by directly calling background functions.
 * "var result = chrome.extension.getBackgroundPage().f();"
 *
 * @param {Object} message - An object bundling request details, which vary with the message's type.
 * @param {string} message.type - One of the types above.
 * @param {MessageSender} [sender] - An object containing info about the script context that sent the request. postMessage() seems to provide this implicitly.
 * @param [sendResponse] - A callback function. Parameters vary. Results, if any, willl be 'returned' as args.
 */
chrome.runtime.onConnect.addListener(function(port) {

	var portName = port.name;
	if (!portName || portName == "all" || !(portName in backgroundState["ports"])) portName = "unknown";
	backgroundLog("A new port connected: "+ portName);

	backgroundState["ports"]["all"].push(port);
	backgroundState["ports"][portName].push(port);

	// The listeners below retain access to port and portName at this scope.
	// During onConnect(), port has "sender" property, which may have "tab".

	port.onMessage.addListener(
		function(message, sender, sendResponse) {
			if (message.type == "set_redacting") {
				backgroundLog("Message received: "+ message.type +", "+ message.value);
				// Comes from options or popup.

				setRedacting(Boolean(message.value), true);
			}
			else if (message.type == "show_page_action") {
				chrome.pageAction.show(port.sender.tab.id);
				if (chrome.runtime.lasterror);
				// Pretend to handle "No tab with id: ##" error. To stop Chrome printing it.
			}
			else if (message.type == "init_content") {
				backgroundLog("Content init");

				port.postMessage({"type":"set_redacting", "value":backgroundState["redacting"]});
			}
			else if (message.type == "test_evilness") {
				//backgroundLog("Testing evilness: "+ message.userIds.join());
				results = {};
				for (var i=0; i < message.userIds.length; i++) {
					var userId = message.userIds[i];

					if (backgroundState["redact_all"]) {
						results[userId] = true;
					} else {
						results[userId] = (backgroundState["block_list"].indexOf(userId) != -1);
					}
				}
				port.postMessage({"type":"evilness_result", "value":results});
			}
			else if (message.type == "init_options") {
				backgroundLog("Options init");

				port.postMessage({"type":"set_redacting", "value":backgroundState["redacting"]});
				port.postMessage({"type":"set_twitter_ready", "value":twitterState["authorized"]});
				port.postMessage({"type":"set_status_text", "value":getBlockListStatusString()});
			}
			else if (message.type == "verify_twitter_credentials") {
				verifyCredentials(function(reply, err) {
					var s;
					if (!Boolean(err)) {
						s = "Credentials verified. Screen name: "+ reply.screen_name;
					} else {
						s = "Credentials could not be verified: "+ err.error;
					}
					port.postMessage({"type":"set_status_text", "value":s});
				});
				return true;
			}
			else if (message.type == "request_twitter_pin") {
				requestPIN();
			}
			else if (message.type == "submit_twitter_pin") {
				submitPIN(message.value);
			}
			else if (message.type == "fetch_block_list") {
				fetchLimits();
				fetchBlockList();
			}
			else if (message.type == "init_popup") {
				backgroundLog("Popup init");

				port.postMessage({"type":"set_redacting", "value":backgroundState["redacting"]});
				port.postMessage({"type":"set_redact_all", "value":backgroundState["redact_all"]});
			}
			else if (message.type == "set_redact_all") {
				backgroundLog("Message received: "+ message.type +", "+ message.value);

				backgroundState["redact_all"] = Boolean(message.value);
				broadcastMessage("popup", {"type":"set_redact_all", "value":backgroundState["redact_all"]});
				broadcastMessage("content", {"type":"reset_evilness"});
			}
			else if (message.type == "get_storage") {
				chrome.storage.local.get(
					message.keys,
					function(data) {
						if (chrome.runtime.lasterror) {
							backgroundLog(chrome.runtime.lastError.message);
						}
						sendResponse(data);
					}
				);
				return true;
			}
		}
	);

	port.onDisconnect.addListener(function() {
		var i = backgroundState["ports"]["all"].length;
		while (i--) {
			if (backgroundState["ports"]["all"][i] == port) {
				backgroundState["ports"]["all"].splice(i, 1);
			}
		}
		var i = backgroundState["ports"][portName].length;
		while (i--) {
			if (backgroundState["ports"][portName][i] == port) {
				backgroundState["ports"][portName].splice(i, 1);
			}
		}
		backgroundLog("A port disconnected: "+ portName);
	});
});



/*
chrome.storage.onChanged.addListener(function(changes, namespace) {
	for (key in changes) {
		if (!changes.hasOwnProperty(key)) continue;

		var storageChange = changes[key];

		console.log(
			"Storage key "%s" in namespace "%s" changed from "%s" to "%s".",
			key,
			namespace,
			storageChange.oldValue,
			storageChange.newValue
		);

		//if (key == "redacting") {
			//backgroundLog("Storage key 'redacting' changed to "+ storageChange.newValue);
		//}
	}
});
*/



/**
 * Posts a message to all ports of a given type.
 *
 * @param {string|string[]} audience - One or more portNames.
 * @param {Object} message - An object to pass along.
 */
function broadcastMessage(audience, message) {
	if (Object.prototype.toString.call(audience) === "[object Array]") {
		for (var i=0; i < audience.length; i++) {
			var portName = audience[i];
			broadcastMessage(portName, message);
		}
	}
	else if (typeof audience === "string") {
		var portName = audience;
		if (!backgroundState["ports"].hasOwnProperty(portName)) return;

		for (var i=0; i < backgroundState["ports"][portName].length; i++) {
			var destPort = backgroundState["ports"][portName][i];
			destPort.postMessage(message);
		}
	}
}

/**
 * Broadcasts a message to all ports, setting new status text.
 *
 * @param {string} text
 * @param {string} severity - One of: "notice", "warning", "error".
 */
function announceStatus(text, severity) {
	broadcastMessage("all", {"type":"set_status_text", "value":text});
}

function getBlockListStatusString() {
	var count = backgroundState["block_list"].length;
	var stamp = backgroundState["block_list_timestamp"];
	var dateStr = (stamp ? new Date(stamp).toLocaleString() : "");

	var s = "Block list count: "+ count;
	if (dateStr) s += ". ("+ dateStr +")"
	return s;
}



function twitterInit() {
	chrome.storage.local.get(
		["oauth_key", "oauth_secret"],
		function(data) {
			if (chrome.runtime.lasterror) {
				backgroundLog(chrome.runtime.lastError.message);
			}
			else if (data.oauth_key && data.oauth_secret) {
				backgroundLog("Using cached Twitter credentials");
				codebird.setToken(data.oauth_key, data.oauth_secret);
				setTwitterAuthorized(true);
			}
			else {
				backgroundLog("No cached Twitter credentials to use");
			}
		}
	);
}

/**
 * Tests Twitter credentials and fetches user info.
 *
 * Success can be checked with !Boolean(err).
 *
 * @param [callback] - Callback function f(reply, err).
 */
function verifyCredentials(callback) {
	backgroundLog("Verifying credentials");

	twitterCall(
		"account_verifyCredentials",
		{},
		function(reply, rate, err) {
			if (err) {
				backgroundLog("Credentials verification error: "+ err.error);
			}
			else {
				backgroundLog("Credentials verified: "+ reply.screen_name);
			}
			if (callback) callback(reply, err);
		}
	);
}



/**
 * Opens a new tab with a PIN that the user should copy + paste.
 *
 * This is the first step in getting new credentials.
 */
function requestPIN() {
	backgroundLog("Fetching an oauth PIN request token");
	twitterCall(
		"oauth_requestToken",
		{"oauth_callback":"oob"},
		function(reply, rate, err) {
			if (err) {
				backgroundLog("Oauth token request failed: "+ err.error);
				return;
			}
			if (reply) {
				codebird.setToken(reply.oauth_token, reply.oauth_token_secret);
				setTwitterAuthorized(false);

				backgroundLog("Requesting an oauth PIN url");
				twitterCall(
					"oauth_authorize",
					{},
					function(authUrl) {
						chrome.tabs.create({"url":authUrl, "active":true});
						// TODO: Track/notify whether authUrl was set, to prevent bogus submitPIN() calls.
					}
				);
			}
		}
	);
}

function submitPIN(pin) {
	if (!pin) return;

	backgroundLog("Submitting pin: "+ pin);
	twitterCall(
		"oauth_accessToken",
		{"oauth_verifier":pin},
		function(reply, rate, err) {
			if (err) {
				backgroundLog("Oauth PIN submission failed: "+ err.error);
				return;
			}
			if (reply) {
				announceStatus("PIN accepted. New credentials have been set.", "notice");
				backgroundLog("Applying new credentials");
				codebird.setToken(reply.oauth_token, reply.oauth_token_secret);
				setTwitterAuthorized(true);

				chrome.storage.local.set(
					{"oauth_key":reply.oauth_token, "oauth_secret":reply.oauth_token_secret},
					function() {
						if (chrome.runtime.lasterror) {
							backgroundLog(chrome.runtime.lastError.message);
						}
					}
				);
			}
		}
	);
}



/**
 * Calls a Twitter API method, caching rate limit info from the reply.
 *
 * @param {string} methodName - A codebird method name.
 * @param {Object} params - A dict of parameters for the method.
 * @param callback - A function to process the response, f(reply, rate, err).
 */
function twitterCall(methodName, params, callback) {
	codebird.__call(methodName, params,
		function(reply, rate, err) {
			// Kludge to make codebird 2.6.0, which only passes reply/rate?, act like 3.0.0.
			if (reply) {
				if (reply.hasOwnProperty("errors")) {
					err = {"error":"code "+ reply.errors[0].code +", "+ reply.errors[0].message};

				}
			}

			// rate's keys are defined, but sometimes the values are all null!?
			//   https://github.com/jublonet/codebird-js/issues/115
			//   http://stackoverflow.com/questions/7462968/restrictions-of-xmlhttprequests-getresponseheader
			//
			if (rate && rate.hasOwnProperty("remaining")) {
				backgroundLog("TwitterAPI "+ methodName +": "+ rate.remaining +" calls remaining");
			}
			setLimits(methodName, rate);
			callback(reply, rate, err);
		}
	);
}



/**
 * Prefetches Twitter API rate limits for methods en masse.
 */
function fetchLimits() {
	// Families is a comma-separated list of method paths truncated at slash.
  var families = "blocks";

	twitterCall(
		"application_rateLimitStatus",
		{"resources":families},
		function(reply, rate, err) {
			if (err) {                                               // Normally undefined.
				backgroundLog("Limits fetch error: "+ err.error);      // Twitter complained or socket timeout.
			}

			for (family in reply.resources) {
				if (!reply.resources.hasOwnProperty(family)) continue;

				var rates = reply.resources[family];
				for (methodPath in rates) {
					if (!rates.hasOwnProperty(methodPath)) continue;

					// Convert methodPath to codebird names.
					var methodName = methodPath.replace(/(_.)/, function(x) {return x.toUpperCase();})
					methodName = methodName.replace(/(:.*)/, function(x) {return x.toUpperCase();})
					methodName = methodName.replace(/^\//, "");
					methodName = methodName.replace(/\//, "_");
					twitterState["rate"][methodName] = rates[methodPath];

					//backgroundLog("Limit cached: "+ methodName);
				}
			}
		}
	);
}

/**
 * Sets rate limit info for a Twitter method.
 *
 * @param {string} methodName - A codebird method name.
 * @param {Object} rate - {limit:"number", remaining:"number", reset:"timestamp"} or null.
 */
function setLimits(methodName, rate) {
	if (rate && "limit" in rate && "remaining" in rate && "reset" in rate
		&& rate.limit != null && rate.remaining != null && rate.reset != null) {

		twitterState["rate"][methodName] = rate;
	}
}

/**
 * Returns rate limit info for a Twitter method.
 *
 * @param {string} methodName - A codebird method name.
 * @returns {Object} - {limit:"number", remaining:"number", reset:"timestamp"} or null.
 */
function getLimits(methodName) {
	if (twitterState["rate"].hasOwnProperty(methodName)) return twitterState["rate"][methodName];
	return null;
}



function fetchBlockListBackend(fetchState) {
	if (fetchState["doomed"]) {
		if (fetchState["timeout_id"] != null) {
			backgroundLog("Block list fetch callback cancelled (id: "+ fetchState["timeout_id"] +")");
			window.clearTimeout(fetchState["timeout_id"]);
			fetchState["timeout_id"] = null;
		}
		fetchState["new_list"] = [];
		fetchState["next_cursor_str"] = "-1";
		return;
	}

	fetchState["timeout_id"] = null;  // Presumably timeout is what called this func.

	var rate = getLimits("blocks_ids");
	if (rate != null && rate.remaining < 1) {
		var resetStamp = rate.reset;
		var resetDate = new Date(resetStamp);
		var nowStamp =  Date.now();
		var waitDelta = resetStamp - nowStamp;

		backgroundLog("Block list fetch delayed by "+ waitDelta +" seconds (until "+ resetDate.toLocaleString() +")");
		announceStatus("Block list fetch delayed by "+ waitDelta +" seconds (until "+ resetDate.toLocaleString() +")", "warning");

		if (waitDelta < 0) {
			console.assert(waitDelta > 0, "Twitter's rate limit 'reset' timestamp is in the past!? (reset: "+ resetStamp +", now: "+ nowStamp +")");
			abortFetchingBlockList();
			return;
		}

		fetchState["timeout_id"] = window.setTimeout(
			function() {
				fetchBlockListBackend(fetchState);
			},
			waitDelta
		);
		return;
	}
	backgroundLog("Block list fetch (count: "+ fetchState["new_list"].length +", cursor: "+ fetchState["next_cursor_str"] +")");
	announceStatus("Block list fetch progress: "+ fetchState["new_list"].length, "notice");

	twitterCall(
		"blocks_ids",
		{"cursor":fetchState["next_cursor_str"], "stringify_ids":"true"},
		function(reply, rate, err) {
			if (err) {                                               // Normally undefined.
				backgroundLog("Block list fetch error: "+ err.error);  // Twitter complained or socket timeout.
				announceStatus("Block list fetch error: "+ err.error, "error");
				abortFetchingBlockList();
			}

			if (fetchState["doomed"]) return;

			reply.ids.forEach(function(x) {fetchState["new_list"].push(x);});
			fetchState["next_cursor_str"] = reply.next_cursor_str;

			if (fetchState["next_cursor_str"] !== "0") {
				fetchBlockListBackend(fetchState);
			}
			else {
				backgroundLog("Block list fetch completed");

				setBlockList(fetchState["new_list"], Date.now(), true);


				fetchState["new_list"] = [];
				fetchState["next_cursor_str"] = "-1";
			}
		}
	);
}

/**
 * Progressively fetches a fresh block list from Twitter.
 *
 * Any operation running at the time will be aborted.
 */
function fetchBlockList() {
	abortFetchingBlockList();

	var fetchState = {};
	fetchState["new_list"] = [];
	fetchState["next_cursor_str"] = "-1";
	fetchState["timeout_id"] = null;
	fetchState["doomed"] = false;

	backgroundState["black_list_fetch_state"] = fetchState;

	fetchBlockListBackend(fetchState);
}

function isFetchingBlockList() {
	return (backgroundState["black_list_fetch_state"] != null);
}

/**
 * Signals the current block list fetching operation, if any, to self-terminate.
 */
function abortFetchingBlockList() {
	if (backgroundState["black_list_fetch_state"] != null) {
		backgroundLog("Aborting an existing block list fetch operation");
		backgroundState["black_list_fetch_state"]["doomed"] = true;
		backgroundState["black_list_fetch_state"] = null;
	}
}



/**
 * Toggles the redacting state and notifies other scripts.
 *
 * @param {Boolean} b - The new redacting state.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setRedacting(b, store) {
	backgroundState["redacting"] = Boolean(b);

	broadcastMessage("all", {"type":"set_redacting", "value":backgroundState["redacting"]});

	if (store) {
		chrome.storage.local.set(
			{"redacting":backgroundState["redacting"]},
			function() {
				if (chrome.runtime.lasterror) {
					backgroundLog(chrome.runtime.lastError.message);
				}
			}
		);
	}
}

/**
 * Toggles the flag tracking codebird's setToken() calls and notifies other scripts.
 *
 * @param {Boolean} b - The new authorization state.
 */
function setTwitterAuthorized(b) {
	twitterState["authorized"] = b;
	broadcastMessage("options", {"type":"set_twitter_ready", "value":twitterState["authorized"]});
}

/**
 * Replaces the current block list and notifies other scripts.
 *
 * @param {string[]} new_list - The new list of stringified userIds.
 * @param {Number} timestamp - The unix time the list was fetched, or null for now.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setBlockList(new_list, timestamp, store) {
	if (!timestamp) timestamp = Date.now();

	backgroundState["block_list_timestamp"] = timestamp;
	backgroundState["block_list"] = new_list;

	broadcastMessage("content", {"type":"reset_evilness"});

	announceStatus(getBlockListStatusString(), "notice");

	if (store) {
		chrome.storage.local.set(
			{"block_list_timestamp":backgroundState["block_list_timestamp"], "block_list":backgroundState["block_list"]},
			function() {
				if (chrome.runtime.lasterror) {
					backgroundLog(chrome.runtime.lastError.message);
				}
				else {
					chrome.storage.local.getBytesInUse(
						"block_list",
						function(bytes) {
							backgroundLog("Block list saved, requiring "+ bytes +" bytes");
						}
					);
				}
			}
		);
	}
}

function fetchDummyBlockList() {
	backgroundLog("Fetching dummy block list");
	setBlockList(["0987654321","12345678"], null);
}



var codebird = new Codebird();
var consumerKey = "gEvSRw74A2lCdtpT3cktGPVwd";
var consumerSecret = "Zkmlr1W3F4SQUMjcHNsuhL03FzSC9lhe9ZNJGMRYUpsnL4A14v";
codebird.setConsumerKey(consumerKey, consumerSecret);

var backgroundState = {};
backgroundState["redacting"] = false;
backgroundState["redact_all"] = false;
backgroundState["block_list_timestamp"] = Date.now();
backgroundState["block_list"] = [];
backgroundState["ports"] = {"all":[], "content":[], "popup":[], "options":[], "unknown":[]};

var twitterState = {}
twitterState["authorized"] = false;  // Whether codebird has set oauth tokens.
twitterState["rate"] = {};           // Dict of methodName:{limit, remaining, reset}



backgroundInit();
twitterInit();
