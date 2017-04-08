var RNE = RNE || {};

RNE.registry = RNE.registry || (function() {
	// Private
	var upstreamTypeDict = {};
	var upstreamTypeObjs = [];
	var streamTypeDict = {};
	var streamTypeObjs = [];
	var itemTypeDict = {};
	var itemTypeObjs = [];

	var streamNodeAddedHandler = null;
	var newUsersCallback = null;

	var state = {};
	state["redacting"] = false;
	state["redact_all"] = false;
	state["upstreams"] = [];  // List of {node:HTMLElement, type:string, observer:MutationObserver}
	state["streams"] = [];    // List of {node:HTMLElement, type:string, observer:MutationObserver}
	state["items"] = [];      // List of {node:HTMLElement, type:string, primaryUserId:string, userIds:string[]}
	state["users"] = {};      // Dict of string ids to {count:number, evil:bool|null}


	// Public
	var pub = {
		setUpstreamTypes: setUpstreamTypes,
		setStreamTypes: setStreamTypes,
		setItemTypes: setItemTypes,

		setStreamNodeAddedHandler: setStreamNodeAddedHandler,
		setNewUsersCallback: setNewUsersCallback,

		getRegisteredUsers: getRegisteredUsers,
		resetUsersEvilness: resetUsersEvilness,
		setUserEvilness: setUserEvilness,

		updateAllItemsRedaction: updateAllItemsRedaction,
		clearAllItemsRedaction: clearAllItemsRedaction,

		registerAllStreams: registerAllStreams,
		unregisterAllStreams: unregisterAllStreams,

		registerAllUpstreams: registerAllUpstreams,
		unregisterAllUpstreams: unregisterAllUpstreams,
		getUpstreamCount: getUpstreamCount,

		setRedacting: setRedacting,
		isRedacting: isRedacting,

		setRedactAll: setRedactAll,
		isRedactAll: isRedactAll,

		panic: panic
	};

	return pub;



	function setUpstreamTypes(typeObjs) {
		var newTypeDict = {}
		var newTypeObjs = [];
		for (var i=0; i < typeObjs.length; i++) {
			newTypeDict[typeObjs[i].name] = typeObjs[i];
			newTypeObjs.push(typeObjs[i]);
		}
		upstreamTypeDict = newTypeDict;
		upstreamTypeObjs = newTypeObjs;
	}

	function setStreamTypes(typeObjs) {
		var newTypeDict = {}
		var newTypeObjs = [];
		for (var i=0; i < typeObjs.length; i++) {
			newTypeDict[typeObjs[i].name] = typeObjs[i];
			newTypeObjs.push(typeObjs[i]);
		}
		streamTypeDict = newTypeDict;
		streamTypeObjs = newTypeObjs;
	}

	function setItemTypes(typeObjs) {
		var newTypeDict = {}
		var newTypeObjs = [];
		for (var i=0; i < typeObjs.length; i++) {
			newTypeDict[typeObjs[i].name] = typeObjs[i];
			newTypeObjs.push(typeObjs[i]);
		}
		itemTypeDict = newTypeDict;
		itemTypeObjs = newTypeObjs;
	}

	function setStreamNodeAddedHandler(handler) {
		streamNodeAddedHandler = handler;
	}

	function setNewUsersCallback(callback) {
		newUsersCallback = callback;
	}



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

						var streamInfo = registerStream(dredgedStream.node, dredgedStream.type);
						updateAllItemsRedaction({"streamInfo":streamInfo});
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
							clearAllItemsRedaction({"streamInfo":streamInfo});
							unregisterStream(streamInfo);
						}
					}
				}
			}
		});
	}

	function streamMutationCallback(mutations) {
		mutations.forEach(function(mutation) {
			if (mutation.addedNodes != null) {
				for (var i=0; i < mutation.addedNodes.length; i++) {
					var addedNode = mutation.addedNodes[i];

					if (streamNodeAddedHandler && streamNodeAddedHandler(addedNode) === true) {
						// Handler returned true, no need to dredge.
					}
					else {
						var dredgedItems = dredgeInterestingItems(addedNode);

						for (var j=0; j < dredgedItems.length; j++) {
							var dredgedItem = dredgedItems[j];

							var itemInfo = registerItem(dredgedItem.node, dredgedItem.type);

							// Redact if a user is already known to be evil (or redact_all).
							if (itemInfo != null && (state["redact_all"] || isItemTainted(itemInfo))) {
								setItemRedacted(itemInfo, true);
							}
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
	 * @param {HTMLElement} node - A stream-item element.
	 * @returns {string} - An ItemType name, or null.
	 */
	function getItemType(node) {
		var typeObjs = itemTypeObjs;

		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];

			if (typeObj.testNode(node)) return typeObj.name;
		}

		return null;
	}

	/**
	 * Returns info about nested stream elements worth registering.
	 *
	 * MutationObservers watching subtrees aren't notified about *every* tag, just
	 * the highest-level ones.
	 *
	 * @param {HTMLElement} node - An ancestor to search within.
	 * @returns {object[]} - A list of {node:HTMLElement, type:string}
	 */
	function dredgeStreams(node) {
		var results = [];
		if (!node.querySelectorAll) return results;

		var typeObjs = streamTypeObjs;

		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];

			if (typeObj.testNode(node)) {
				results.push({"node":node, "type":typeObj.name});
				return results;
				// TODO: Decide whether to return now or search for nested items?
			}
		}

		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];

			var candidates = node.querySelectorAll(typeObj.dredgeSelector);
			for (var j=0; j < candidates.length; j++) {
				var candidateNode = candidates[j];
				if (typeObj.testNode(candidateNode)) {
					results.push({"node":candidateNode, "type":typeObj.name});
				}
			}
		}

		return results;
	}

	/**
	 * Returns info about nested stream-item elements worth registering.
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

		var typeObjs = itemTypeObjs;

		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];

			if (typeObj.testNode(node)) {
				results.push({"node":node, "type":typeObj.name});
				return results;
				// TODO: Decide whether to return now or search for nested items?
			}
		}

		// Carve out candidates with selectors, then validate their structure.
		// TODO: Sort out nesting?

		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];

			var candidates = node.querySelectorAll(typeObj.dredgeSelector);
			for (var j=0; j < candidates.length; j++) {
				var candidateNode = candidates[j];
				if (typeObj.testNode(candidateNode)) {
					results.push({"node":candidateNode, "type":typeObj.name});
				}
			}
		}

		return results;
	}



	/**
	 * Caches info about a stream for looking up later.
	 *
	 * Streams which have already been registered will be ignored.
	 * Registering a stream one or more times will also register nested stream-items.
	 *
	 * @param {HTMLElement} streamNode - A stream element, containing stream-item elements.
	 * @param {string} streamType - A StreamType name.
	 * @returns {Object} - The cached info, or null.
	 */
	function registerStream(streamNode, streamType) {
		RNE.logging.debug("Stream registered");

		// Enforce uniqueness.
		var streamInfo = null;
		for (var i=0; i < state["streams"].length; i++) {
			if (state["streams"][i].node === streamNode) {
				streamInfo = state["streams"][i];
				break;
			}
		}
		if (streamInfo == null) {
			var streamObserver = new MutationObserver(streamMutationCallback);

			streamInfo = {"node":streamNode, "type":streamType, "observer":streamObserver};
			state["streams"].push(streamInfo);

			if (state["redacting"]) {
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
		var index = state["streams"].indexOf(streamInfo);
		if (index == -1) return;

		streamInfo.observer.disconnect();

		for (var i=0; i < state["items"].length; i++) {
			if (streamInfo.node.contains(state["items"][i].node)) {
				unregisterItem(state["items"][i]);
			}
		}

		state["streams"].splice(index, 1);
	}

	/**
	 * Returns cached info about a stream, or null.
	 *
	 * @param {HTMLElement} node - A node, which was previously cached with registerStream().
	 * @returns {Object}
	 */
	function getStreamInfo(node) {
		for (var i=0; i < state["streams"].length; i++) {
			if (state["streams"][i].node === node) {
				return state["streams"][i];
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
	 * @param {string} itemType - An ItemType name.
	 * @returns {Object} - The cached info, or null.
	 */
	function registerItem(node, itemType) {
		// Enforce uniqueness.
		var oldInfo = getItemInfo(node)
		if (oldInfo != null) return oldInfo;

		//RNE.logging.debug("Stream item registered");

		var users = getItemUsers(node, itemType);

		var itemInfo = {"node":node, "type":itemType, "primaryUserId":users.primaryUserId, "userIds":users.userIds};
		state["items"].push(itemInfo);

		var newUserIds = [];
		for (var i=0; i < itemInfo.userIds.length; i++) {
			var userId = itemInfo.userIds[i];
			if (userId in state["users"]) {
				state["users"][userId].count += 1;
			} else {
				state["users"][userId] = {"count":1, "evil":null};
				newUserIds.push(userId);
			}
		}

		if (newUserIds.length > 0) {
			if (newUsersCallback) newUsersCallback(newUserIds);
		}

		return itemInfo;
	}

	/**
	 * Discards cached info about a stream-item.
	 *
	 * @param {Object} itemInfo - Info which was previously cached with registerItem().
	 */
	function unregisterItem(itemInfo) {
		var index = state["items"].indexOf(itemInfo);
		if (index == -1) return;

		//RNE.logging.debug("Stream item unregistered");

		state["items"].splice(index, 1);

		for (var i=0; i < itemInfo.userIds.length; i++) {
			var userId = itemInfo.userIds[i];
			if (userId in state["users"]) {
				state["users"][userId].count -= 1;
			} else {
				delete state["users"][userId];
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
		for (var i=0; i < state["items"].length; i++) {
			if (state["items"][i].node === node) {
				return state["items"][i];
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
		for (key in state["users"]) {
			if (!state["users"].hasOwnProperty(key)) continue;
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
		for (key in state["users"]) {
			if (!state["users"].hasOwnProperty(key)) continue;
			var userId = key;

			state["users"][userId].evil = null;
		}
	}

	/**
	 * Caches the result of a user evilness test for looking up later.
	 *
	 * @param {string} userId - The user.
	 * @param {Boolean} evilness - True, false, or null.
	 */
	function setUserEvilness(userId, evilness) {
		if (state["users"].hasOwnProperty(userId)) {
			state["users"][userId].evil = evilness;
		}
	}

	/**
	 * Returns the cached result of a user evilness test.
	 *
	 * @param {string} userId - The user.
	 * @returns {Boolean} - True, false, or null.
	 */
	function getUserEvilness(userId) {
		if (state["users"].hasOwnProperty(userId)) {
			return state["users"][userId].evil;
		} else {
			return null;
		}
	}



	/**
	 * Returns userIds present within a stream-item.
	 *
	 * @param {HTMLElement} node - An element, representing a known stream-item.
	 * @param {string} type - An ItemType name.
	 * @returns {Object} - {primaryUserId:string, userIds:string[]}
	 */
	function getItemUsers(node, itemType) {
		var primaryUserId = null;
		var userIds = [];

		if (itemType && itemTypeDict.hasOwnProperty(itemType)) {
			return itemTypeDict[itemType].scrapeUsers(node);
		}

		return {"primaryUserId":primaryUserId, "userIds":userIds};
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

			if (evilness) break;
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
		if (itemInfo.type && itemTypeDict.hasOwnProperty(itemInfo.type)) {
			itemTypeDict[itemInfo.type].setRedacted(itemInfo.node, b);
		}
	}

	/**
	 * Calls setItemRedacted on all stream-items to match users' evilness (or redact all).
	 *
	 * An optional filter will limit the affected items.
	 *
	 * @param {Object} [filter] - {[userId]:string, [streamInfo]:Object}.
	 */
	function updateAllItemsRedaction(filter) {
		for (var i=0; i < state["items"].length; i++) {
			var itemInfo = state["items"][i];

			if (filter) {
				if (filter.userId && itemInfo.userIds.indexOf(filter.userId) == -1) continue;
				if (filter.streamInfo && !filter.streamInfo.node.contains(itemInfo.node)) continue;
			}

			var b = (state["redact_all"] || isItemTainted(itemInfo));
			setItemRedacted(itemInfo, b);
		}
	}

	/**
	 * Clears the redaction of all registered stream-items.
	 *
	 * An optional filter will limit the affected items.
	 *
	 * @param {Object} [filter] - {[userId]:string, [streamInfo]:Object}.
	 */
	function clearAllItemsRedaction(filter) {
		for (var i=0; i < state["items"].length; i++) {
			var itemInfo = state["items"][i];

			if (filter) {
				if (filter.userId && itemInfo.userIds.indexOf(filter.userId) == -1) continue;
				if (filter.streamInfo && !filter.streamInfo.node.contains(itemInfo.node)) continue;
			}

			setItemRedacted(itemInfo, false);
		}
	}

	/**
	 * Registers all stream and stream-item elements currently present.
	 */
	function registerAllStreams() {
		RNE.logging.debug("Registering all streams");  // TODO: Remove me.

		for (var i=0; i < state["upstreams"].length; i++) {
			var upstreamInfo = state["upstreams"][i];

			var dredgedStreams = dredgeStreams(upstreamInfo.node);
			for (var j=0; j < dredgedStreams.length; j++) {
				var dredgedStream = dredgedStreams[j];
				registerStream(dredgedStream.node, dredgedStream.type);
			}
			// TODO: Honor upstreams' subtree attribute to scan immediate children.
		}
	}

	/**
	 * Discards all cached stream and stream-item info.
	 *
	 * Stream-items' redaction status will be unaffected.
	 * Call clearAllItemsRedaction(null) beforehand!
	 */
	function unregisterAllStreams() {
		//RNE.logging.debug("Unregistering all streams");  // TODO: Remove me.

		var i = state["streams"].length;
		while (i--) {
			unregisterStream(state["streams"][i]);
		}

		// Explicitly clear all tweet info, just to be sure.
		state["items"] = [];
		state["users"] = {};
	}

	/**
	 * Registers all upstream elements currently present.
	 *
	 * Set redaction to false beforehand!
	 *
	 * Upstream MutationObservers will not initially be active.
	 * Streams and stream-items will not be dredged/registered.
	 */
	function registerAllUpstreams() {
		var typeObjs = upstreamTypeObjs;

		var upstreamNames = [];
		for (var i=0; i < typeObjs.length; i++) {
			var typeObj = typeObjs[i];
			var upstreamNodes;

			if (typeObj.unique) {
				var upstreamNode = document.querySelector(typeObj.dredgeSelector);
				upstreamNodes = upstreamNode != null ? [upstreamNode] : [];
			} else {
				upstreamNodes = document.querySelectorAll(typeObj.dredgeSelector);
			}

			for (var j=0; j < upstreamNodes.length; j++) {
				var upstreamNode = upstreamNodes[j];
				var upstreamObserver = new MutationObserver(upstreamMutationCallback);

				state["upstreams"].push({"node":upstreamNode, "type":typeObj.name, "observer":upstreamObserver});
			}
			if (upstreamNodes.length > 0) upstreamNames.push(typeObj.name);
		}
		if (upstreamNames.length > 0) {
			RNE.logging.debug("Upstreams present: "+ upstreamNames.join(", "));
		}
	}

	/**
	 * Discards all cached upstream, and stream, and stream-item info.
	 *
	 * Stream-items' redaction status will be unaffected.
	 * Call clearAllItemsRedaction(null) beforehand!
	 */
	function unregisterAllUpstreams() {
		for (var i=0; i < state["upstreams"].length; i++) {
			var upstreamInfo = state["upstreams"][i];
			upstreamInfo.observer.disconnect();
		}
		state["upstreams"] = [];

		unregisterAllStreams();
	}

	/**
	 * Returns the number of upstreams currently registered.
	 */
	function getUpstreamCount() {
		return state["upstreams"].length;
	}



	/**
	 * Toggles DOM monitoring to register/redact any dynamically added streams and stream-items.
	 *
	 * Existing stream-items' redaction status will be unaffected.
	 *
	 * @param {Boolean} b - True to redact, false to un-redact
	 */
	function setRedacting(b) {
		state["redacting"] = b;

		if (b) {
			for (var i=0; i < state["upstreams"].length; i++) {
				var upstreamInfo = state["upstreams"][i];
				var typeObj = upstreamTypeDict[upstreamInfo.type];

				var upstreamCfg = {"childList":true, "attributes":false, "characterData":false, "subtree":typeObj.subtree};
				upstreamInfo.observer.observe(upstreamInfo.node, upstreamCfg);
			}

			for (var i=0; i < state["streams"].length; i++) {
				var streamInfo = state["streams"][i];

				var observerCfg = {childList:true, attributes:false, characterData:false, subtree:true};
				streamInfo.observer.observe(streamInfo.node, observerCfg);
			}
		}
		else {
			for (var i=0; i < state["upstreams"].length; i++) {
				var upstreamInfo = state["upstreams"][i];
				upstreamInfo.observer.disconnect();
			}

			for (var i=0; i < state["streams"].length; i++) {
				var streamInfo = state["streams"][i];

				streamInfo.observer.disconnect();
			}
		}
	}

	function isRedacting() {
		return state["redacting"];
	}



	function setRedactAll(b) {
		state["redact_all"] = b;
		updateAllItemsRedaction(null);
	}

	function isRedactAll() {
		return state["redact_all"];
	}



	/**
	 * Tries to get this script into an inert state, in case of emergency.
	 */
	function panic() {
		setRedacting(false);
		clearAllItemsRedaction(null);
		unregisterAllUpstreams();
	}
})();
