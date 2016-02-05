RNE.logging.setVerbosity(RNE.logging.Level.DEBUG);



var ItemType = {
	TWEET: "tweet",
	PROFILE_CARD: "profile_card"
};



/**
 * A MutationObserver callback watching ancestors for added/removed streams.
 */
function upstreamMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				var dredgedStreams = dredgeStreams(addedNode);

				for (var j=0; j < dredgedStreams.length; j++) {
					var dredgedStream = dredgedStreams[j];

					var streamInfo = registerStream(dredgedStream);
					setStreamRedacted(streamInfo, true);
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				var dredgedStreams = dredgeStreams(removedNode);

				for (var j=0; j < dredgedStreams.length; j++) {
					var dredgedStream = dredgedStreams[j];

					var streamInfo = getStreamInfo(removedNode);

					if (streamInfo != null) {
						streamInfo.observer.disconnect();
						setStreamRedacted(streamInfo, false);
						unregisterStream(streamInfo);
					}
				}
			}
		}
	});
}

/**
 * A MutationObserver callback watching streams for added/removed items.
 */
function streamMutationCallback(mutations) {
	mutations.forEach(function(mutation) {
		if (mutation.addedNodes != null) {
			for (var i=0; i < mutation.addedNodes.length; i++) {
				var addedNode = mutation.addedNodes[i];

				var dredgedItems = dredgeInterestingItems(addedNode);

				for (var j=0; j < dredgedItems.length; j++) {
					var dredgedItem = dredgedItems[j];

					var itemInfo = registerItem(dredgedItem.node, dredgedItem.type);

					// Redact if a user is already known to be evil.
					if (itemInfo != null && isItemTainted(itemInfo)) {
						setItemRedacted(itemInfo, true);
					}
				}
			}
		}
		if (mutation.removedNodes != null) {
			for (var i=0; i < mutation.removedNodes.length; i++) {
				var removedNode = mutation.removedNodes[i];

				var interestingItems = dredgeInterestingItems(removedNode);

				for (var j=0; j < interestingItems.length; j++) {
					var dredgedItem = interestingItems[j];

					var itemInfo = getItemInfo(dredgedItem.node);

					if (itemInfo != null) {
						setItemRedacted(itemInfo, false);
						unregisterItem(itemInfo);
					}
				}
			}
		}
	});
}



/**
 * Returns the type of a stream-item node, based on DOM structure.
 *
 * @param {HTMLElement} node - A stream-item element (tweet.div[data-user-id]).
 * @returns {string} - An ItemType constant, or null.
 */
function getItemType(node) {
	if (node.nodeName.match(/\bdiv\b/i) && node.classList.contains("tweet") && node.hasAttribute("data-user-id")) {
		var contentDiv = node.querySelector(":scope > div.content");
		if (contentDiv != null) return ItemType.TWEET;
	}
	else if (node.nodeName.match(/\bdiv\b/i) && node.classList.contains("ProfileCard") && node.hasAttribute("data-user-id")) {
		var bioDiv = node.querySelector(":scope > div.ProfileCard-content p.ProfileCard-bio");
		if (bioDiv != null) return ItemType.PROFILE_CARD;
	}

	return null;
}

/**
 * Returns a list of stream elements worth registering.
 *
 * MutationObservers watching subtrees aren't notified about *every* tag, just
 * the highest-level ones.
 *
 * @param {HTMLElement} node - An ancestor to search within.
 * @returns {HTMLElement[]}
 */
function dredgeStreams(node) {
	var results = [];
	if (!node.querySelectorAll) return results;

	if (node.classList.contains("js-navigable-stream")) {
		results.push(node);
		// Don't return yet. Streams can be nested.
	}

	var selectedNodes = node.querySelectorAll("ol.js-navigable-stream");
	Array.prototype.push.apply(results, selectedNodes);

	return results;
}

/**
 * Returns info about nested elements worth registering.
 *
 * MutationObservers watching subtrees aren't notified about *every* tag, just
 * the highest-level ones.
 *
 * @param {HTMLElement} node - An ancestor to search within.
 * @returns {object[]} - A list of {node:HTMLElement, type:string}
 */
function dredgeInterestingItems(node) {
	var results = [];
	if (!node.querySelectorAll) return results;

	var nodeType = getItemType(node);
	if (nodeType != null) {
		results.push({"node":node, "type":nodeType});
		return results;
		// TODO: Decide if type precludes searching for nested items.
	}

	// Carve out candidates with selectors, then validate their structure.
	// TODO: Sort out nesting?
	var candidates = [];
	var tweetDivs = node.querySelectorAll("div.tweet");
	var profileCardDivs = node.querySelectorAll("div.ProfileCard");

	// Call push(), having exploded the array-like object into individual args.
	Array.prototype.push.apply(candidates, tweetDivs);
	Array.prototype.push.apply(candidates, profileCardDivs);

	for (var i=0; i < candidates.length; i++) {
		var candidateType = getItemType(candidates[i]);
		if (candidateType != null) {
			results.push({"node":candidates[i], "type":candidateType});
		}
	}

	return results;
}



/**
 * Tries to get this script into an inert state, in case of emergency.
 */
function panic() {
	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];
		upstreamInfo.observer.disconnect();
	}
	contentState["upstreams"] = [];

	setRedacting(false);
	setAllItemsRedacted(false);
	unregisterAllStreams();
	contentState["streams"] = [];

	if (contentState["nav_observer"]) {
		contentState["nav_observer"].disconnect();
	}
}

/**
 * Resets state vars when a page loads initially or swaps out its contents.
 */
function initStateVars() {
	// Note: ol#stream-items-id is NOT unique!

	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];
		upstreamInfo.observer.disconnect();
	}
	contentState["upstreams"] = [];

	contentState["streams"] = [];
	unregisterAllStreams();

	var pendingUpstreams = [];
	var timelineDiv = document.querySelector("div#timeline");
	if (timelineDiv != null) {
		RNE.logging.debug("Found a timeline div to watch for streams");
		pendingUpstreams.push(timelineDiv);
	}
	var permalinkDiv = document.querySelector("div.PermalinkOverlay-body");
	if (permalinkDiv != null) {
		RNE.logging.debug("Found a permalink overlay div to watch for streams");
		pendingUpstreams.push(permalinkDiv);
	}
	for (var i=0; i < pendingUpstreams.length; i++) {
		var upstreamNode = pendingUpstreams[i];
		var upstreamObserver = new MutationObserver(upstreamMutationCallback);

		contentState["upstreams"].push({"node":upstreamNode, "observer":upstreamObserver});

		var ancestorCfg = {childList:true, attributes:false, characterData:false, subtree:true};
		upstreamObserver.observe(upstreamNode, ancestorCfg);
	}
}

/**
 * Initializes page-change monitoring (call only once).
 *
 * Navigation on Twitter doesn't *really* leave the current page. It swaps
 * out contents. Normally scripts would overlook this, only kicking in if
 * you directly visit a search url or reload the page.
 *
 * When the page has changed, the new DOM will be examined, and any
 * clutter from past meddling will be removed.
 */
function contentInit() {
	RNE.logging.info("Content script started");

	var navDiv = document.querySelector("div#page-container");
	if (navDiv == null) {
		RNE.logging.info("No page-container div!? Aborting");
		return;
	}

	setStylesheet("vanilla-blank.css");

	initStateVars();

	if (contentState["upstreams"].length > 0) {
		RNE.logging.info("Twitter page with upstreams loaded");

		backgroundPort.postMessage({type:"init_content"});
	}
	else {
		RNE.logging.info("No upstreams present, idling");
	}

	contentState["nav_observer"] = new MutationObserver(function(mutations) {
		var pageChanged = false;

		mutations.forEach(function(mutation) {
			if (mutation.type === "childList") pageChanged = true;
		});

		if (pageChanged) {
			if (contentState["upstreams"].length > 0) {
				// When revisiting previous pages, undo past meddling and init from scratch.
				// It seems the DOM is cloned, since testing against remembered nodes fails.
				// Spawned buttons persist but can't be reused: they lose their event listeners!?

				setRedacting(false);
				setAllItemsRedacted(false);
				unregisterAllStreams();
			}
			initStateVars();
			if (contentState["upstreams"] > 0) {
				RNE.logging.info("Twitter page content changed, now has upstreams");

				backgroundPort.postMessage({type:"init_content"});
			}
			else {
				RNE.logging.info("Twitter page content changed, no upstreams present");
			}
		}
	});
	var navCfg = {childList:true, attributes:false, characterData:false, subtree:false};
	contentState["nav_observer"].observe(navDiv, navCfg);
}



/**
 * Caches info about a stream for looking up later.
 *
 * Streams which have already been registered will be ignored.
 * Registering a stream one or more times will also register nested stream-items.
 *
 * @param {HTMLElement}  - An ol.js-navigable-stream element, containing stream-item elements.
 * @returns {Object} - The cached info, or null.
 */
function registerStream(streamNode) {
	RNE.logging.debug("Stream registered");

	// Enforce uniqueness.
	var streamInfo = null;
	for (var i=0; i < contentState["streams"].length; i++) {
		if (contentState["streams"][i].node === streamNode) {
			streamInfo = contentState["streams"][i];
			break;
		}
	}
	if (streamInfo == null) {
		var streamObserver = new MutationObserver(streamMutationCallback);

		streamInfo = {"node":streamNode, "observer":streamObserver};
		contentState["streams"].push(streamInfo);

		if (contentState["redacting"]) {
			var streamCfg = {childList:true, attributes:false, characterData:false, subtree:true};
			streamObserver.observe(streamNode, streamCfg);
		}
	}

	var dredgedItems = dredgeInterestingItems(streamNode);
	for (var i=0; i < dredgedItems.length; i++) {
		var dredgedItem = dredgedItems[i];

		registerItem(dredgedItem.node, dredgedItem.type);
	}

	return streamInfo;
}

/**
 * Discards cached info about a stream.
 *
 * Nested stream-items will also be unregistered.
 *
 * @param {Object} streamInfo - Info which was previously cached with registerStream().
 */
function unregisterStream(streamInfo) {
	var index = contentState["streams"].indexOf(streamInfo);
	if (index == -1) return;

	streamInfo.observer.disconnect();

	for (var i=0; i < contentState["items"].length; i++) {
		if (streamInfo.node.contains(contentState["items"][i].node)) {
			unregisterItem(contentState["items"][i]);
		}
	}

	contentState["streams"].splice(index, 1);
}

/**
 * Returns cached info about a stream, or null.
 *
 * @param {HTMLElement} node - A node, which was previously cached with registerStream().
 * @returns {Object}
 */
function getStreamInfo(node) {
	for (var i=0; i < contentState["streams"].length; i++) {
		if (contentState["streams"][i].node === node) {
			return contentState["streams"][i];
		}
	}
	return null;
}

/**
 * Caches info about a stream-item for looking up later.
 *
 * New users will be checked for evilness.
 * Nodes which have already been registered will be ignored.
 *
 * @param {HTMLElement} node - An element representing a stream-item.
 * @param {string} itemType - An ItemType constant.
 * @returns {Object} - The cached info, or null.
 */
function registerItem(node, itemType) {
	// Enforce uniqueness.
	var oldInfo = getItemInfo(node)
	if (oldInfo != null) return oldInfo;

	//RNE.logging.debug("Stream item registered");

	var users = getItemUsers(node, itemType);

	var itemInfo = {"node":node, "type":itemType, "primaryUserId":users.primaryUserId, "userIds":users.userIds};
	contentState["items"].push(itemInfo);

	var newUserIds = [];
	for (var i=0; i < itemInfo.userIds.length; i++) {
		var userId = itemInfo.userIds[i];
		if (userId in contentState["users"]) {
			contentState["users"][userId].count += 1;
		} else {
			contentState["users"][userId] = {"count":1, "evil":null};
			newUserIds.push(userId);
		}
	}

	if (newUserIds.length > 0) {
		backgroundPort.postMessage({"type":"test_evilness", "userIds":newUserIds});
	}

	return itemInfo;
}

/**
 * Discards cached info about a stream-item.
 *
 * @param {Object} itemInfo - Info which was previously cached with registerItem().
 */
function unregisterItem(itemInfo) {
	var index = contentState["items"].indexOf(itemInfo);
	if (index == -1) return;

	//RNE.logging.debug("Stream item unregistered");

	contentState["items"].splice(index, 1);

	for (var i=0; i < itemInfo.userIds.length; i++) {
		var userId = itemInfo.userIds[i];
		if (userId in contentState["users"]) {
			contentState["users"][userId].count -= 1;
		} else {
			delete contentState["users"][userId];
		}
	}
}

/**
 * Returns cached info about a stream-item, or null.
 *
 * @param {HTMLElement} node - A node, which was previously cached with registerItem().
 * @returns {Object}
 */
function getItemInfo(node) {
	for (var i=0; i < contentState["items"].length; i++) {
		if (contentState["items"][i].node === node) {
			return contentState["items"][i];
		}
	}
	return null;
}

/**
 * Returns a new list of unique author userIds among registered stream-items.
 *
 * @returns {string[]}
 */
function getRegisteredUsers() {
	var result = [];
	for (key in contentState["users"]) {
		if (!contentState["users"].hasOwnProperty(key)) continue;
		var userId = key;

		result.push(userId);
	}
	return result;
}

/**
 * Discards cached results of all user evilness tests.
 *
 * Stream-items' redaction status will be unaffected.
 */
function resetUsersEvilness() {
	for (key in contentState["users"]) {
		if (!contentState["users"].hasOwnProperty(key)) continue;
		var userId = key;

		contentState["users"][userId].evil = null;
	}
}

/**
 * Caches the result of a user evilness test for looking up later.
 *
 * @param {string} userId - The user.
 * @param {Boolean} evilness - True, false, or null.
 */
function setUserEvilness(userId, evilness) {
	if (contentState["users"].hasOwnProperty(userId)) {
		contentState["users"][userId].evil = evilness;
	}
}

/**
 * Returns the cached result of a user evilness test.
 *
 * @param {string} userId - The user.
 * @returns {Boolean} - True, false, or null.
 */
function getUserEvilness(userId) {
	if (contentState["users"].hasOwnProperty(userId)) {
		return contentState["users"][userId].evil;
	} else {
		return null;
	}
}



/**
 * Returns userIds present within a stream-item.
 *
 * A tweet's author will be the primary userId.
 *
 * @param {HTMLElement} node - An element, representing a known stream-item.
 * @param {string} type - An ItemType constant.
 * @returns {Object} - {primaryUserId:string, userIds:string[]}
 */
function getItemUsers(node, itemType) {
	var primaryUserId = null;
	var userIds = [];

	if (itemType === ItemType.TWEET) {
		var origTweetDiv = node;
		var userId = origTweetDiv.getAttribute("data-user-id")
		if (userId) {
			primaryUserId = ""+ userId;
			userIds.push(""+ userId);
		}

		var quoteTweetDiv = node.querySelector("div.QuoteTweet-innerContainer[data-user-id]");
		if (quoteTweetDiv != null) {
			var userId = quoteTweetDiv.getAttribute("data-user-id");
			if (userId) {
				userIds.push(""+ userId);
			}
		}
	}
	else if (itemType === ItemType.PROFILE_CARD) {
		var userId = node.getAttribute("data-user-id")
		if (userId) {
			primaryUserId = ""+ userId;
			userIds.push(""+ userId);
		}
	}

	return {"primaryUserId":primaryUserId, "userIds":userIds};
}

/**
 * Calls setItemRedacted(itemInfo, true) on all stream-items involving a given user.
 *
 * @param {string} userId - The user.
 */
function redactUser(userId) {
	var count = 0;
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];
		if (itemInfo.userIds.indexOf(userId) != -1) {
			count++;
			setItemRedacted(itemInfo, true);
		}
	}
	//RNE.logging.debug("Redacted a user id "+ userId +" (count: "+ count +")");
}

/**
 * Returns true if a given stream-item involves a blocked user.
 *
 * @param {Object} itemInfo - Cached stream-item info.
 * @returns {Boolean}
 */
function isItemTainted(itemInfo) {
	var userIds = itemInfo.userIds;

	var evilness = false;
	for (var i=0; i < userIds.length; i++) {
		var userId = userIds[i];
		evilness = getUserEvilness(userId);
		if (evilness) {
			//RNE.logging.debug("Found a naughty user id "+ userId);
			break;
		}
	}
	return evilness;
}

/**
 * Sets or clears the redaction of a single stream-item.
 *
 * @param {Object} itemInfo - Cached stream-item info.
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setItemRedacted(itemInfo, b) {
	if (itemInfo.type === ItemType.TWEET) {
		var methodName = (b ? "add" : "remove");
		itemInfo.node.classList[methodName]("rne-vanilla-tweet-redacted");
	}
	else if (itemInfo.type === ItemType.PROFILE_CARD) {
		var methodName = (b ? "add" : "remove");
		itemInfo.node.classList[methodName]("rne-vanilla-profile-card-redacted");
	}
}

/**
 * Sets or clears the redaction of all registered stream-items.
 *
 * Only the stream-items involving evil users will actually be redacted.
 *
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setAllItemsRedacted(b) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		setItemRedacted(itemInfo, (b && isItemTainted(itemInfo)));
	}
}

/**
 * Sets or clears the redaction of registered stream-items within a given stream.
 *
 * Only the stream-items involving evil users will actually be redacted.
 *
 * @param {Object} streamInfo - Cached stream info.
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setStreamRedacted(streamInfo, b) {
	for (var i=0; i < contentState["items"].length; i++) {
		var itemInfo = contentState["items"][i];

		if (streamInfo.node.contains(itemInfo.node)) {
			setItemRedacted(itemInfo, (b && isItemTainted(itemInfo)));
		}
	}
}

/**
 * Registers all stream and stream-item elements currently present.
 */
function registerAllStreams() {
	RNE.logging.debug("Registering all streams");  // TODO: Remove me.

	for (var i=0; i < contentState["upstreams"].length; i++) {
		var upstreamInfo = contentState["upstreams"][i];

		var streamNodes = document.querySelectorAll("ol.js-navigable-stream");
		for (var j=0; j < streamNodes.length; j++) {
			registerStream(streamNodes[j]);
		}
	}
}

/**
 * Discards all cached stream and stream-item info.
 *
 * Stream-items' redaction status will be unaffected. Call setAllItemsRedacted(false) beforehand!
 */
function unregisterAllStreams() {
	//RNE.logging.debug("Unregistering all streams");  // TODO: Remove me.

	var i = contentState["streams"].length;
	while (i--) {
		unregisterStream(contentState["streams"][i]);
	}

	// Explicitly clear all tweet info, just to be sure.
	contentState["items"] = [];
	contentState["users"] = {};
}

/**
 * Toggles DOM monitoring to register/redact any dynamically added stream-items.
 *
 * Existing stream-items' redaction status will be unaffected.
 *
 * @param {Boolean} b - True to redact, false to un-redact
 */
function setRedacting(b) {
	contentState["redacting"] = b;

	if (b) {
		for (var i=0; i < contentState["streams"].length; i++) {
			var streamInfo = contentState["streams"][i];

			var observerCfg = {childList:true, attributes:false, characterData:false, subtree:true};
			streamInfo.observer.observe(streamInfo.node, observerCfg);
		}
	}
	else {
		for (var i=0; i < contentState["streams"].length; i++) {
			var streamInfo = contentState["streams"][i];

			streamInfo.observer.disconnect();
		}
	}
}



/**
 * Replaces the redaction stylesheet with another file.
 *
 * @param {string} cssFile - A path to the css file, relative to the extension's root.
 */
function setStylesheet(cssFile) {
	var oldLink = document.querySelector("link#rne-stylesheet");
	if (oldLink != null) document.getElementsByTagName("head")[0].removeChild(oldLink);

	var newLink = document.createElement("link");
	newLink.id = "rne-stylesheet";
	newLink.href = chrome.extension.getURL(cssFile);
	newLink.type = "text/css";
	newLink.rel = "stylesheet";
	document.getElementsByTagName("head")[0].appendChild(newLink);
}



var contentState = {};
contentState["redacting"] = false;
contentState["nav_observer"] = null;
contentState["upstreams"] = [];  // List of {node:HTMLElement, observer:MutationObserver}
contentState["streams"] = [];    // List of {node:HTMLElement, observer:MutationObserver}
contentState["items"] = [];      // List of {node:HTMLElement, type:string, primaryUserId:string, userIds:string[]}
contentState["users"] = {};      // Dict of string ids to {count:number, evil:bool|null}



var backgroundPort = chrome.runtime.connect({"name":"content"});

backgroundPort.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (contentState["upstreams"].length == 0) return;  // No streams, ignore all messages.

		if (message.type == "reset_evilness") {
			RNE.logging.debug("Message received: "+ message.type);
			resetUsersEvilness();
			setAllItemsRedacted(false);

			var userIds = getRegisteredUsers();
			backgroundPort.postMessage({"type":"test_evilness","userIds":userIds});
		}
		else if (message.type == "evilness_result") {
			//RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			for (key in message.value) {
				if (!message.value.hasOwnProperty(key)) continue;

				var userId = key;
				var evilness = message.value[key];
				setUserEvilness(userId, evilness);
				if (evilness) redactUser(userId);
			}
		}
		else if (message.type == "set_redacting_vanilla") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var b = Boolean(message.value);
			if (b && b != contentState["redacting"]) {
				// Monitor if not already doing so and redact.
				setRedacting(true);
				registerAllStreams();
				setAllItemsRedacted(true);
			} else if (b == false) {
				// Stop monitoring and clear redaction.
				setRedacting(false);
				setAllItemsRedacted(false);
				unregisterAllStreams();
			}
		}
		else if (message.type == "set_redaction_style") {
			RNE.logging.debug("Message received: "+ message.type +", "+ message.value);
			var name = message.value;
			var cssFiles = {"blank":"vanilla-blank.css", "faded":"vanilla-faded.css"};
			var cssFile = (cssFiles.hasOwnProperty(name) ? cssFiles[name] : cssFiles["blank"]);
			setStylesheet(cssFile);
		}
	}
);

// Content scripts are left running when the extension is reloaded/updated.
backgroundPort.onDisconnect.addListener(function() {
	RNE.logging.warning("Connection lost to background script! The page needs reloading.");

	RNE.dialog.showMessageBox("ReadNoEvil - Error", "max-content",
		[
			"ReadNoEvil stopped running while it had a script injected here.",
			"Until this page is reloaded, it may be unstable."
		]
	);

	panic();
});



backgroundPort.postMessage({type:"show_page_action"});

contentInit();
