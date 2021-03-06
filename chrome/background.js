RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



var Alarm = {
	FETCH_BLOCK_LIST: "fetch_block_list",
	REFETCH_CHECK: "fetch_block_list_if_expired"
};



/**
 * Opens, or switches to, the options page.
 *
 * Chrome 42+ introduced a function to do this.
 * Earlier versions need to open a new tab.
 */
function openOptionsPage() {
	var m = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
	if (m && parseInt(m[2], 10) >= 42) {
		chrome.runtime.openOptionsPage();
	}
	else {
		var optionsUrl = chrome.extension.getURL("options.html");

		chrome.tabs.query({"url":optionsUrl},
			function(tabs) {
				if (tabs.length > 0) {
					chrome.tabs.update(tabs[0].id, {"active":true});
				} else {
					chrome.tabs.create({"url":optionsUrl});
				}
			}
		);
	}
}



function backgroundInit() {
	// Find out how old any existing settings in storage are.
	var getStorageVersionTask = function() {
		return new Promise(function(resolve, reject) {
			chrome.storage.local.get(["storage_version"], function(data) {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				}
				var storageVersion = (data.storage_version != null ? data.storage_version : 1);
				resolve(storageVersion);
			});
		});
	};

	// Depending on storageVersion, translate deprecated settings to the current structure.
	var getStoredSettingsTask = function(storageVersion) {
		return new Promise(function(resolve, reject) {
			if (storageVersion <= 1) {     // RNE v0.0.10.
				chrome.storage.local.get(
					[
						"storage_version",
						"oauth_key", "oauth_secret",
						"redacting_vanilla", "redacting_tweetdeck",
						"observing_you_block", "hooking_menus",
						"redaction_style",
						"block_list_fetch_interval",
						"block_list_fetch_state",
						"block_list", "block_list_timestamp"
					],
					function(data) {
						if (chrome.runtime.lastError) {
							reject(new Error(chrome.runtime.lastError.message));
						}
						data.storage_version = storageVersion;

						var newBlockList = {"userIds":[], "timestamp":Date.now()};

						if (data.block_list != null) {
							newBlockList.userIds = data.block_list;

							if (data.block_list_timestamp != null) {
								newBlockList.timestamp = data.block_list_timestamp;
							}
						}
						delete data.block_list;            // {string[]} - Stringified userId numbers.
						delete data.block_list_timestamp;  // {string} - Unix time of fetch.
						data.block_list = newBlockList;

						if (data.oauth_key != null && data.oauth_secret != null) {
							data.oauth_tokens = {"key":data.oauth_key, "secret":data.oauth_secret};
						} else {
							data.oauth_tokens = null;
						}
						delete data.oauth_key;     // {string}
						delete data.oauth_secret;  // {string}

						resolve(data);
					}
				);
			} else {
				chrome.storage.local.get(
					[
						"storage_version",
						"oauth_tokens",
						"redacting_vanilla", "redacting_tweetdeck",
						"observing_you_block", "hooking_menus",
						"redaction_style",
						"block_list_fetch_interval",
						"block_list_fetch_state",
						"block_list"
					],
					function(data) {
						if (chrome.runtime.lastError) {
							reject(new Error(chrome.runtime.lastError.message));
						}
						data.storage_version = storageVersion;
						resolve(data);
					}
				);
			}
		});
	};

	// Apply stored settings to backgroundState.
	var applyStoredSettingsTask = function(data) {
		return new Promise(function(resolve, reject) {
			var newBlockList = {"userIds":[], "timestamp":Date.now()};
			var newFetchInterval = 0;
			var newOauthTokens = null;

			var newRedactingVanilla = (data.redacting_vanilla != null ? data.redacting_vanilla : true);
			var newRedactingTweetdeck = (data.redacting_tweetdeck != null ? data.redacting_tweetdeck : true);
			var newObservingYouBlock = (data.observing_you_block != null ? data.observing_you_block : true);
			var newHookingMenus = (data.hooking_menus != null ? data.hooking_menus : true);
			var newRedactionStyle = (["blank", "faded"].indexOf(data.redaction_style) != -1 ? data.redaction_style : "blank" );

			if (data.block_list != null) newBlockList = data.block_list;

			if (data.block_list_fetch_interval != null) {
				newFetchInterval = data.block_list_fetch_interval;
			}

			if (data.oauth_tokens != null) newOauthTokens = data.oauth_tokens;

			setRedactingVanilla(newRedactingVanilla, false);
			setRedactingTweetdeck(newRedactingTweetdeck, false);
			setObservingYouBlock(newObservingYouBlock, false);
			setHookingMenus(newHookingMenus, false);
			setRedactionStyle(newRedactionStyle, false);
			setBlockListFetchInterval(newFetchInterval, false);
			setBlockList(newBlockList, false);
			backgroundState["block_list_fetch_state"] = data.block_list_fetch_state;

			if (newOauthTokens != null) {
				RNE.logging.info("Using cached Twitter credentials");
				codebird.setToken(newOauthTokens.key, newOauthTokens.secret);
				setTwitterAuthorized(true);
			} else {
				RNE.logging.info("No cached Twitter credentials to use");
			}

			resolve(data);
		});
	};

	// Re-save everything if storageVersion is outdated.
	var modernizeStorageTask = function(data) {
		return new Promise(function(resolve, reject) {
			if (data.storage_version !== backgroundState["storage_version"]) {
				RNE.logging.info("Clearing storage and re-saving all settings");

				chrome.storage.local.clear(function() {
					if (chrome.runtime.lastError) {
						RNE.logging.warning(chrome.runtime.lastError.message);
					}
					chrome.storage.local.set(
						{
							"storage_version":backgroundState["storage_version"],
							"oauth_tokens":data.oauth_tokens,
							"redacting_vanilla":backgroundState["redacting_vanilla"],
							"redacting_tweetdeck":backgroundState["redacting_tweetdeck"],
							"observing_you_block":backgroundState["observing_you_block"],
							"hooking_menus":backgroundState["hooking_menus"],
							"redaction_style":backgroundState["redaction_style"],
							"block_list_fetch_interval":backgroundState["block_list_fetch_interval"],
							"block_list_fetch_state":backgroundState["block_list_fetch_state"],
							"block_list":backgroundState["block_list"]
						},
						function() {
							if (chrome.runtime.lastError) {
								RNE.logging.warning(chrome.runtime.lastError.message);
							}
							resolve();
						}
					);
				});
			}
			else {
				resolve();
			}
		});
	};

	// Clear alarms not worth remembering.
	var clearCruftAlarmsTask = function() {
		return new Promise(function(resolve, reject) {
			var alarmIds = [Alarm.REFETCH_CHECK];

			var clearAlarm = function(alarmId) {
				chrome.alarms.clear(alarmId, function(wasCleared) {
					if (alarmIds.length > 0) {
						clearAlarm(alarmIds.splice(0, 1)[0]);
					}
					else {
						resolve();
					}
				});
			};
			clearAlarm(alarmIds.splice(0, 1)[0]);
		});
	};

	// Print any pending alarms. Then set up alarm handlers.
	var printAlarmsTask = function() {
		return new Promise(function(resolve, reject) {
			chrome.alarms.getAll(function(alarms) {
				if (alarms.length > 0) {
					RNE.logging.debug("Pending alarms...");
					for (var i=0; i < alarms.length; i++) {
						var a = alarms[i];
						RNE.logging.debug("  "+ a.name +" ("+ new Date(a.scheduledTime).toLocaleTimeString() +")");
					}
				}
				resolve();
			});
		});
	};

	var alarmsInitTask = function() {
		return new Promise(function(resolve, reject) {
			alarmsInit();
			resolve();
		});
	};

	Promise.resolve()
		.then(getStorageVersionTask)
		.then(getStoredSettingsTask)
		.then(applyStoredSettingsTask)
		.then(modernizeStorageTask)
		.then(clearCruftAlarmsTask)
		.then(printAlarmsTask)
		.then(alarmsInitTask)
		.catch(function(err) {
			RNE.logging.error(err);
		});

	// To debug promises...
	//   Bring up the background page.
	//   Click the "Sources" tab.
	//   Enable "Async" and "Pause on exceptions".
	//   Optionally enable "Pause on Caught Exceptions".
	//   Reload the extension.
	//
	//   Note: Disable them afterward. These options are shared across all windows.
}



/**
 * Handles messages from the other scripts in this extension.
 *
 * This isn't actually a function, but I'll comment anyway, as if were valid for JSDoc.
 *
 * set_redacting_vanilla:
 *   Toggles redaction on Twitter.com.
 *   param {Boolean} value
 *
 * set_redacting_tweetdeck:
 *   Toggles redaction on Tweetdeck.
 *   param {Boolean} value
 *
 * show_page_action:
 *   Displays this extension's clickable icon, in the address bar.
 *   This must only be sent after: document.visibilityState == "visible".
 *
 * test_users_evilness:
 *   Tests users against the block list, reporting results in a set_users_evilness message.
 *   param {string[]} userIds
 *
 * set_users_evilness:
 *   Adds/removes users in the block list.
 *   param {Object.<string, Boolean>} value - A dict of userId:evilness pairs.
 *
 * request_block:
 *   Sends a block request to Twitter and, if successful, modifies the local block list.
 *   param {string} userId
 *   param {string} [screenName]
 *
 * request_unblock:
 *   Sends an unblock request to Twitter and, if successful, modifies the local block list.
 *   param {string} userId
 *   param {string} [screenName]
 *
 * set_redaction_style:
 *   Sets which stylesheet to use for redacted elements.
 *   param {string} value - One of: blank, faded.
 *
 * verify_twitter_credentials:
 *   Asks Twitter is the oauth credentials are valid. Status text will be set describing the result.
 *
 * request_twitter_pin:
 *   Opens a PIN auth tab.
 *
 * submit_twitter_pin:
 *   Submits a previously requested PIN to complete authorization.
 *   param {string} value - The number seen.
 *
 * fetch_block_list:
 *   Fetches a fresh copy of the block list.
 *
 * set_block_list_fetch_interval:
 *   Sets how often the block list should be re-fetched.
 *   param {string} value - The new number of days, or "".
 *
 * set_redact_all:
 *   Toggles redacting ALL users.
 *   param {Boolean} value
 *
 * open_options_page:
 *   Opens the options page.
 *
 * Options pages may have no tabId and do not support sendResponse. :/
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
	RNE.logging.debug("A new port connected: "+ portName);

	backgroundState["ports"]["all"].push(port);
	backgroundState["ports"][portName].push(port);

	// The listeners below retain access to port and portName at this scope.
	// During onConnect(), port has "sender" property, which may have "tab".

	port.onMessage.addListener(
		function(message, sender, sendResponse) {
			if (message.type == "set_redacting_vanilla") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
				// Comes from options or popup.

				var b = Boolean(message.value);
				if (b != backgroundState["redacting_vanilla"]) {
					setRedactingVanilla(b, true);
				}
			}
			else if (message.type == "set_redacting_tweetdeck") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
				// Comes from options or popup.

				var b = Boolean(message.value);
				if (b != backgroundState["redacting_tweetdeck"]) {
					setRedactingTweetdeck(b, true);
				}
			}
			else if (message.type == "show_page_action") {
				chrome.pageAction.show(port.sender.tab.id);

				// Assume the sender had waited until the page was visible.
				// No way to suppress potential "No tab with id: ##" error in log.
				// If it'd had a callback, checking chrome.runtime.lastError would do that.
			}
			else if (message.type == "init_content") {
				RNE.logging.info("Content init");

				port.postMessage({"type":"set_redact_all", "value":backgroundState["redact_all"]});
				port.postMessage({"type":"set_redaction_style", "value":backgroundState["redaction_style"]});
				port.postMessage({"type":"set_redacting_vanilla", "value":backgroundState["redacting_vanilla"]});
				port.postMessage({"type":"set_redacting_tweetdeck", "value":backgroundState["redacting_tweetdeck"]});
				port.postMessage({"type":"set_observing_you_block", "value":backgroundState["observing_you_block"]});
				port.postMessage({"type":"set_hooking_menus", "value":backgroundState["hooking_menus"]});
			}
			else if (message.type == "test_users_evilness") {
				//RNE.logging.debug("Testing users evilness: "+ message.userIds.join());
				evilnessResults = {};
				for (var i=0; i < message.userIds.length; i++) {
					var userId = message.userIds[i];

					evilnessResults[userId] = (backgroundState["block_list"].userIds.indexOf(userId) != -1);
				}
				port.postMessage({"type":"set_users_evilness", "value":evilnessResults});
			}
			else if (message.type == "set_users_evilness") {
				var addIds = [];
				var remIds = [];
				for (var key in message.value) {
					if (!message.value.hasOwnProperty(key)) continue;

					var userId = key;
					var evilness = message.value[key];
					if (evilness) {
						addIds.push(userId);
					} else {
						remIds.push(userId);
					}
				}
				modifyBlockList(addIds, remIds);
			}
			else if (message.type == "request_block") {
				requestBlock(message.user_id, message.screen_name);
			}
			else if (message.type == "request_unblock") {
				requestUnblock(message.user_id, message.screen_name);
			}
			else if (message.type == "init_options") {
				RNE.logging.info("Options init");

				port.postMessage({"type":"set_redacting_vanilla", "value":backgroundState["redacting_vanilla"]});
				port.postMessage({"type":"set_redacting_tweetdeck", "value":backgroundState["redacting_tweetdeck"]});
				port.postMessage({"type":"set_observing_you_block", "value":backgroundState["observing_you_block"]});
				port.postMessage({"type":"set_hooking_menus", "value":backgroundState["hooking_menus"]});
				port.postMessage({"type":"set_redaction_style", "value":backgroundState["redaction_style"]});
				port.postMessage({"type":"set_block_list_fetch_interval", "value":backgroundState["block_list_fetch_interval"]});
				port.postMessage({"type":"set_twitter_ready", "value":twitterState["authorized"]});
				port.postMessage({"type":"set_block_list_description", "value":getBlockListDescription(), "count":backgroundState["block_list"].userIds.length});
				port.postMessage({"type":"set_status_text", "value":getLastAnnouncedStatus()});
			}
			else if (message.type == "set_observing_you_block") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);

				setObservingYouBlock(Boolean(message.value), true);
			}
			else if (message.type == "set_hooking_menus") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);

				setHookingMenus(Boolean(message.value), true);
			}
			else if (message.type == "set_redaction_style") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);

				if (message.value != backgroundState["redaction_style"]) {
					setRedactionStyle(message.value, true);
				}
			}
			else if (message.type == "verify_twitter_credentials") {
				verifyCredentials(function(reply, err) {
					var status = {};
					status.when = Date.now();
					if (!Boolean(err)) {
						status.text = "Credentials verified for "+ reply.screen_name;
						status.severity = "notice";
					} else {
						status.text = "Credentials could not be verified: "+ err.error;
						status.severity = "error";
					}
					port.postMessage({"type":"set_status_text", "value":status});
				});
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
			else if (message.type == "set_block_list_fetch_interval") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
				var interval = message.value.replace(/[^0-9]/g, "");
				if (interval == "") interval = 0;

				if (interval != backgroundState["block_list_fetch_interval"]) {
					setBlockListFetchInterval(interval, true);
					var status = {"text":"New fetch interval set: "+ interval, "severity":"notice", "when":Date.now()};
					port.postMessage({"type":"set_status_text", "value":status});
				}
			}
			else if (message.type == "init_popup") {
				RNE.logging.info("Popup init");

				port.postMessage({"type":"set_redacting_vanilla", "value":backgroundState["redacting_vanilla"]});
				port.postMessage({"type":"set_redacting_tweetdeck", "value":backgroundState["redacting_tweetdeck"]});
				port.postMessage({"type":"set_redact_all", "value":backgroundState["redact_all"]});
			}
			else if (message.type == "set_redact_all") {
				RNE.logging.debug("Message received: "+ message.type +", "+ message.value);

				backgroundState["redact_all"] = Boolean(message.value);
				broadcastMessage("all", {"type":"set_redact_all", "value":backgroundState["redact_all"]});
			}
			else if (message.type == "open_options_page") {
				RNE.logging.debug("Message received: "+ message.type);
				openOptionsPage();
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
		RNE.logging.debug("A port disconnected: "+ portName);
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
			//RNE.logging.debug("Storage key 'redacting' changed to "+ storageChange.newValue);
		//}
	}
});
*/



chrome.runtime.onInstalled.addListener(function(details) {
	if (details.reason == "install") {
		// First run: Open the options page.
		openOptionsPage();
	}
});



/**
 * Sets up alarm handlers.
 *
 * DOM-based setInterval() is not rate-limited, but it will be forgotten if the script suspends.
 *
 * Alarms are limited to firing 1 per minute, but they will survive if the script suspends.
 *
 * Alarms even survive restarting the browser, so make sure relevant state vars are serialized.
 *
 * Any alarms which are past due will fire immediately.
 */
function alarmsInit() {
	chrome.alarms.create(Alarm.REFETCH_CHECK, {"delayInMinutes":1, "periodInMinutes":60});

	chrome.alarms.onAlarm.addListener(function(alarm) {
		RNE.logging.debug("Alarm fired: "+ alarm.name +" ("+ new Date(alarm.scheduledTime).toLocaleString() +")");

		if (alarm.name == Alarm.REFETCH_CHECK) {
			fetchBlockListIfExpired();
		}
		if (alarm.name == Alarm.FETCH_BLOCK_LIST) {
			chrome.storage.local.remove(["block_list_fetch_state"]);

			var fetchState = backgroundState["block_list_fetch_state"];
			if (fetchState && !fetchState["doomed"]) {
				announceStatus("Fetching block list", "notice", true);

				fetchBlockListBackend(fetchState);
			}
			else {
				backgroundState["block_list_fetch_state"] = null;
			}
		}
	});
}



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
 * @param {Boolean} persistent - If true, the message will be cached for getLastAnnouncedStatus().
 */
function announceStatus(text, severity, persistent) {
	var nowStamp = Date.now();
	var status = {"text":text, "severity":severity, "when":nowStamp};
	broadcastMessage("all", {"type":"set_status_text", "value":status});
	if (persistent) {
		backgroundState["last_status"] = status;
	}
}

/**
 * Returns the last persistent message passed to announceStatus().
 *
 * @returns {Object} - {text:string, severity:string, when:timestamp}, or null
 */
function getLastAnnouncedStatus() {
	return backgroundState["last_status"];
}

/**
 * Returns a description of the block list.
 *
 * @returns {string}
 */
function getBlockListDescription() {
	var count = backgroundState["block_list"].userIds.length;
	var stamp = backgroundState["block_list"].timestamp;
	var dateStr = (stamp ? new Date(stamp).toLocaleString() : "");

	var s = count +" users";
	if (dateStr) s += " ("+ dateStr +")"
	return s;
}



/**
 * Tests Twitter credentials and fetches user info.
 *
 * Success can be checked with !Boolean(err).
 *
 * @param [callback] - Callback function f(reply, err).
 */
function verifyCredentials(callback) {
	RNE.logging.info("Verifying credentials");

	twitterCall(
		"account_verifyCredentials",
		{},
		function(reply, rate, err) {
			if (err) {
				RNE.logging.warning("Credentials verification error: "+ err.error);
			}
			else {
				RNE.logging.info("Credentials verified: "+ reply.screen_name);
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
	RNE.logging.info("Fetching an oauth PIN request token");
	twitterCall(
		"oauth_requestToken",
		{"oauth_callback":"oob"},
		function(reply, rate, err) {
			if (err) {
				RNE.logging.info("Oauth token request failed: "+ err.error);
				return;
			}
			if (reply) {
				codebird.setToken(reply.oauth_token, reply.oauth_token_secret);
				setTwitterAuthorized(false);

				RNE.logging.info("Requesting an oauth PIN url");
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

	RNE.logging.info("Submitting pin: "+ pin);
	twitterCall(
		"oauth_accessToken",
		{"oauth_verifier":pin},
		function(reply, rate, err) {
			if (err) {
				RNE.logging.info("Oauth PIN submission failed: "+ err.error);
				return;
			}
			if (reply) {
				announceStatus("PIN accepted. New credentials have been set.", "notice", false);
				RNE.logging.info("Applying new credentials");
				codebird.setToken(reply.oauth_token, reply.oauth_token_secret);
				setTwitterAuthorized(true);

				chrome.storage.local.set(
					{"oauth_tokens":{"key":reply.oauth_token, "secret":reply.oauth_token_secret}},
					function() {
						if (chrome.runtime.lastError) {
							RNE.logging.warning(chrome.runtime.lastError.message);
						}
					}
				);
			}
		}
	);
}



/**
 * Sends a block request to Twitter and announces the result.
 *
 * According to BlockTogether's source, "actions.js" says:
 * "Note that the block endpoint can only block one user at a time,
 * but it does not appear to have a rate limit."
 *
 * https://github.com/jsha/blocktogether/blob/7a19c7761022e585fc46d04ff443aba28b394bb4/actions.js#L74
 */
function requestBlock(userId, screenName) {
	if (!userId) return;
	if (typeof screenName === "undefined") screenName = null;

	RNE.logging.info("Requesting block"+ (screenName ? " for @"+ screenName : "") +" (userId: "+ userId +")");
	twitterCall(
		"blocks_create",
		{"user_id":userId},
		function(reply, rate, err) {
			if (err) {
				var errorMsg = "Block failed"+ (screenName ? " for @"+ screenName : "") +" (userId: "+ userId +"): "+ err.error;
				RNE.logging.error(errorMsg);
				announceStatus(errorMsg, "error", true);
				broadcastMessage("content", {"type":"toast", "style":"error", "text":errorMsg});

				return;
			}
			if (reply) {
				var successMsg = "Blocked"+ (screenName ? " @"+ screenName : "");
				RNE.logging.info(successMsg);
				announceStatus(successMsg, "notice", false);
				broadcastMessage("content", {"type":"toast", "style":"success", "text":successMsg});

				modifyBlockList([userId], null);
			}
		}
	);
}

function requestUnblock(userId, screenName) {
	if (!userId) return;
	if (typeof screenName === "undefined") screenName = null;

	RNE.logging.info("Requesting unblock"+ (screenName ? " for @"+ screenName : "") +" (userId: "+ userId +")");
	twitterCall(
		"blocks_destroy",
		{"user_id":userId, "include_entities":"false", "skip_status":"true"},
		function(reply, rate, err) {
			if (err) {
				var errorMsg = "Unblock failed"+ (screenName ? " for @"+ screenName : "") +" (userId: "+ userId +", ): "+ err.error;
				RNE.logging.error(errorMsg);
				announceStatus(errorMsg, "error", true);
				broadcastMessage("content", {"type":"toast", "style":"error", "text":errorMsg});

				return;
			}
			if (reply) {
				var successMsg = "Unblocked"+ (screenName ? " @"+ screenName : "");
				RNE.logging.info(successMsg);
				announceStatus(successMsg, "notice", false);
				broadcastMessage("content", {"type":"toast", "style":"success", "text":successMsg});

				modifyBlockList(null, [userId]);
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

			// It's possible for rate to be defined, but with null values.
			// If non-string boolean args are passed to __call(), oauth breaks, and reply.errors will exist.
			//
			//   https://github.com/jublonet/codebird-js/issues/115
			//
			if (rate && rate.hasOwnProperty("remaining")) {
				RNE.logging.debug("TwitterAPI "+ methodName +": "+ rate.remaining +" calls remaining");
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
			if (err) {                                       // Normally undefined.
				RNE.logging.warning("Limits fetch error: "+ err.error);  // Twitter complained or socket timeout.
			}

			for (family in reply.resources) {
				if (!reply.resources.hasOwnProperty(family)) continue;

				var rates = reply.resources[family];
				for (methodPath in rates) {
					if (!rates.hasOwnProperty(methodPath)) continue;

					// Convert methodPath to codebird names.
					var methodName = methodPath;
					methodName = methodName.replace(/(_.)/, function(x) {return x.toUpperCase();})
					methodName = methodName.replace(/(:.*)/, function(x) {return x.toUpperCase();})
					methodName = methodName.replace(/^\//, "");
					methodName = methodName.replace(/\//, "_");
					setLimits(methodName, rates[methodPath]);

					//RNE.logging.debug("Limit cached: "+ methodName);
				}
			}
		}
	);
}

/**
 * Sets rate limit info for a Twitter method.
 *
 * Note; The reset timestamp is in seconds. Date.now() is in milliseconds.
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
 * Note; The reset timestamp is in seconds. Date.now() is in milliseconds.
 *
 * @param {string} methodName - A codebird method name.
 * @returns {Object} - {limit:"number", remaining:"number", reset:"timestamp"} or null.
 */
function getLimits(methodName) {
	if (twitterState["rate"].hasOwnProperty(methodName)) return twitterState["rate"][methodName];
	return null;
}



function fetchBlockListBackend(fetchState) {
	if (!fetchState || fetchState["doomed"]) return;

	var nowStamp;
	var resetStamp;
	var rate = getLimits("blocks_ids");
	if (rate != null) {
		var nowStamp = Date.now();
		var resetStamp = rate.reset * 1000 + 1000;  // Convert Twitter secs to JS msecs, +1 sec to cover the difference.

		if (resetStamp - nowStamp < -2 * 24 * 60 * 60 * 1000) {
			RNE.logging.warning("Block list fetch error: Twitter's rate limit 'reset' timestamp is in the distant past!? (reset: "+ resetStamp +", now: "+ nowStamp +")");
			abortFetchingBlockList();
			return;
		}
		else if (resetStamp - nowStamp < 0) {
			rate = null;                            // The limit has been reset already.
		}

		if (rate != null && rate.remaining < 1) {

			// Wait an extra 30 sec.
			var deltaMin = Math.max((resetStamp - nowStamp) / 1000 / 60 + 0.5, 1);  // Alarm args are minutes >= 1.0.
			var nextDate = new Date(nowStamp + (deltaMin * 60 * 1000));

			RNE.logging.info("Block list fetch delayed by "+ deltaMin.toFixed(1) +" minutes (until "+ nextDate.toLocaleTimeString() +")");
			announceStatus("Block list fetch delayed by "+ deltaMin.toFixed(1) +" minutes (until "+ nextDate.toLocaleTimeString() +")", "warning", true);

			chrome.storage.local.set(
				{"block_list_fetch_state":fetchState},
				function() {
					if (chrome.runtime.lastError) {
						RNE.logging.warning(chrome.runtime.lastError.message);
					} else {
						chrome.alarms.create(Alarm.FETCH_BLOCK_LIST, {"delayInMinutes":deltaMin});
					}
				}
			);

			return;
		}
	}
	RNE.logging.info("Block list fetch (count: "+ fetchState["new_list"].length +", cursor: "+ fetchState["next_cursor_str"] +")");
	announceStatus("Fetching block list. Users so far: "+ fetchState["new_list"].length, "notice", true);

	twitterCall(
		"blocks_ids",
		{"cursor":fetchState["next_cursor_str"], "stringify_ids":"true"},
		function(reply, rate, err) {
			if (err) {                                                 // Normally undefined.
				fetchState["doomed"] = true;
				if (backgroundState["block_list_fetch_state"] == fetchState) {
					backgroundState["block_list_fetch_state"] = null;
				}
				RNE.logging.warning("Block list fetch error: "+ err.error);  // Twitter complained or socket timeout.

				var errorMsg = "Error fetching block list: "+ err.error;
				announceStatus(errorMsg, "error", true);
				broadcastMessage("content", {"type":"toast", "style":"error", "text":errorMsg});
			}

			if (fetchState["doomed"]) return;

			reply.ids.forEach(function(x) {fetchState["new_list"].push(x);});
			fetchState["next_cursor_str"] = reply.next_cursor_str;

			if (fetchState["next_cursor_str"] !== "0") {
				fetchBlockListBackend(fetchState);
			}
			else {
				RNE.logging.info("Block list fetch completed");
				announceStatus("Block list fetch completed.", "notice", true);

				setBlockList({"userIds":fetchState["new_list"], "timestamp":Date.now()}, true);

				if (backgroundState["block_list_fetch_state"] == fetchState) {
					backgroundState["block_list_fetch_state"] = null;
				}
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
	fetchState["doomed"] = false;

	backgroundState["block_list_fetch_state"] = fetchState;

	fetchBlockListBackend(fetchState);
}

/**
 * Signals the current block list fetching operation, if any, to self-terminate.
 */
function abortFetchingBlockList() {
	if (backgroundState["block_list_fetch_state"] != null) {
		RNE.logging.info("Aborting an existing block list fetch operation");

		backgroundState["block_list_fetch_state"]["doomed"] = true;
		backgroundState["block_list_fetch_state"] = null;
	}
	chrome.alarms.clear(Alarm.FETCH_BLOCK_LIST);
	chrome.storage.local.remove(["block_list_fetch_state"]);
}

/**
 * Fetches a new block list if the interval has expired (and not already doing so).
 */
function fetchBlockListIfExpired() {
	if (backgroundState["block_list_fetch_interval"] == 0) return;
	if (!twitterState["authorized"]) return;
	if (backgroundState["block_list_fetch_state"] != null) return;

	var nowStamp = Date.now();
	var listStamp = backgroundState["block_list"].timestamp;
	var fetchInterval = backgroundState["block_list_fetch_interval"];
	var daysOld = (nowStamp - listStamp) / 1000 / 60 / 60 / 24;

	if (daysOld > fetchInterval) {
		// Note: toFixed(N) formats a float into a string with N decimal places (+ will concatenate!).

		RNE.logging.info("Re-fetching expired block list (Age: "+ daysOld.toFixed(1) +" days, Interval: "+ fetchInterval +")");
		announceStatus("Re-fetching block list", "notice", true);

		fetchBlockList();
	}
}



/**
 * Toggles the vanilla redacting state and notifies other scripts.
 *
 * @param {Boolean} b - The new redacting state.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setRedactingVanilla(b, store) {
	backgroundState["redacting_vanilla"] = Boolean(b);

	broadcastMessage("all", {"type":"set_redacting_vanilla", "value":backgroundState["redacting_vanilla"]});

	if (store) {
		setStorage({"redacting_vanilla":backgroundState["redacting_vanilla"]});
	}
}

/**
 * Toggles the tweetdeck redacting state and notifies other scripts.
 *
 * @param {Boolean} b - The new redacting state.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setRedactingTweetdeck(b, store) {
	backgroundState["redacting_tweetdeck"] = Boolean(b);

	broadcastMessage("all", {"type":"set_redacting_tweetdeck", "value":backgroundState["redacting_tweetdeck"]});

	if (store) {
		setStorage({"redacting_tweetdeck":backgroundState["redacting_tweetdeck"]});
	}
}

/**
 * Toggles the redaction style and notifies other scripts.
 *
 * @param {Boolean} value - One of: blank, faded.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setRedactionStyle(value, store) {
	if (["blank", "faded"].indexOf(value) == -1) return;

	backgroundState["redaction_style"] = value;

	broadcastMessage("all", {"type":"set_redaction_style", "value":backgroundState["redaction_style"]});

	if (store) {
		setStorage({"redaction_style":backgroundState["redaction_style"]});
	}
}

/**
 * Toggles you-block observation and notifies other scripts.
 *
 * @param {Boolean} b - The new you-block observation state.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setObservingYouBlock(b, store) {
	backgroundState["observing_you_block"] = Boolean(b);

	broadcastMessage("all", {"type":"set_observing_you_block", "value":backgroundState["observing_you_block"]});

	if (store) {
		setStorage({"observing_you_block":backgroundState["observing_you_block"]});
	}
}

/**
 * Toggles menu hooking and notifies other scripts.
 *
 * @param {Boolean} b - The new hooking menus state.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setHookingMenus(b, store) {
	backgroundState["hooking_menus"] = Boolean(b);

	broadcastMessage("all", {"type":"set_hooking_menus", "value":backgroundState["hooking_menus"]});

	if (store) {
		setStorage({"hooking_menus":backgroundState["hooking_menus"]});
	}
}

/**
 * Sets the age at which the block list needs updating and notifies other scripts.
 *
 * @param {Number} days - A positive integer, or 0 to disable.
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setBlockListFetchInterval(days, store) {
	backgroundState["block_list_fetch_interval"] = days;

	broadcastMessage("options", {"type":"set_block_list_fetch_interval", "value":backgroundState["block_list_fetch_interval"]});

	if (store) {
		setStorage({"block_list_fetch_interval":backgroundState["block_list_fetch_interval"]});
	}
}

function setStorage(dict) {
	chrome.storage.local.set(
		dict,
		function() {
			if (chrome.runtime.lastError) {
				RNE.logging.warning(chrome.runtime.lastError.message);
			}
		}
	);
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
 * The list's userIds are stringified numbers.
 * The list's timestamp is the unix time when it was fetched (or Date.now()).
 *
 * @param {Object} new_list - {userIds:string[], timestamp:string}
 * @param {Boolean} store - True to set localstorage, false otherwise.
 */
function setBlockList(newBlockList, store) {
	backgroundState["block_list"] = newBlockList;

	broadcastMessage("content", {"type":"reset_evilness"});
	broadcastMessage("options", {"type":"set_block_list_description", "value":getBlockListDescription(), "count":backgroundState["block_list"].userIds.length});

	if (store) {
		chrome.storage.local.set(
			{"block_list":backgroundState["block_list"]},
			function() {
				if (chrome.runtime.lastError) {
					RNE.logging.warning(chrome.runtime.lastError.message);
				}
				else {
					chrome.storage.local.getBytesInUse(
						"block_list",
						function(bytes) {
							RNE.logging.debug("Block list saved, requiring "+ bytes +" bytes");
						}
					);
				}
			}
		);
	}
}

function fetchDummyBlockList() {
	RNE.logging.info("Fetching dummy block list");
	setBlockList({"userIds":["0987654321","12345678"], "timestamp":Date.now()}, false);
}

/**
 * Adds/removes users in the block list, notifies other scripts, and stores the list.
 *
 * The timestamp will be affected.
 *
 * @param {string[]} addIds - A list of userIds to add.
 * @param {string[]} remIds - A list of userIds to remove.
 */
function modifyBlockList(addIds, remIds) {
	if (!addIds && !remIds) return;

	var evilnessResults = {};
	var modified = false;

	if (addIds) {
		for (var i=0; i < addIds.length; i++) {
			var userId = addIds[i];

			if (!userId || backgroundState["block_list"].userIds.indexOf(userId) != -1) continue;

			backgroundState["block_list"].userIds.push(userId);
			evilnessResults[userId] = true;   // Just added, definitely evil.
			modified = true;
		}
	}
	if (remIds) {
		for (var i=0; i < remIds.length; i++) {
			var userId = remIds[i];

			if (!userId) continue;
			var index = backgroundState["block_list"].userIds.indexOf(userId);
			if (index == -1) continue;

			backgroundState["block_list"].userIds.splice(index, 1);
			evilnessResults[userId] = false;  // Just removed, definitely not evil.
			modified = true;
		}
	}

	if (modified) {
		broadcastMessage("content", {"type":"set_users_evilness", "value":evilnessResults});

		broadcastMessage("options", {"type":"set_block_list_description", "value":getBlockListDescription(), "count":backgroundState["block_list"].userIds.length});
		setStorage({"block_list":backgroundState["block_list"]});
	}
}



var codebird = new Codebird();
var consumerKey = "gEvSRw74A2lCdtpT3cktGPVwd";
var consumerSecret = "Zkmlr1W3F4SQUMjcHNsuhL03FzSC9lhe9ZNJGMRYUpsnL4A14v";
codebird.setConsumerKey(consumerKey, consumerSecret);

var backgroundState = {};
backgroundState["storage_version"] = 2;
backgroundState["redact_all"] = false;
backgroundState["redacting_vanilla"] = false;
backgroundState["redacting_tweetdeck"] = false;
backgroundState["redaction_style"] = "blank";
backgroundState["observing_you_block"] = false;
backgroundState["hooking_menus"] = false;
backgroundState["block_list_fetch_interval"] = 0;
backgroundState["block_list_fetch_state"] = null;
backgroundState["block_list"] = {"userIds":[], "timestamp":Date.now()};
backgroundState["last_status"] = null;  // {text, severity, when}
backgroundState["ports"] = {"all":[], "content":[], "popup":[], "options":[], "unknown":[]};

var twitterState = {}
twitterState["authorized"] = false;  // Whether codebird has set oauth tokens.
twitterState["rate"] = {};           // Dict of methodName:{limit, remaining, reset}



backgroundInit();
