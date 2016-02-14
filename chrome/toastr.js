/*
 * Toastr
 * Modified to not depend on jQuery, by David Millis
 *
 * Changes from the original:
 *   - FadeIn/SlideDown effects were replaced with CSS3 transition classes: see getDefaults().
 *         http://caniuse.com/#feat=css-transitions
 *   - HTMLElement.classList
 *
 * Original Notice
 * ---------------
 * Copyright 2012-2015
 * Authors: John Papa, Hans Fjällemark, and Tim Ferrell.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * ARIA Support: Greta Krafsig
 *
 * Project: https://github.com/CodeSeven/toastr
 */
var toastr = toastr || (
    function() {
        // Proper :hover style support requires at least a <!DOCTYPE html>.

        // jQuery migration notes
        //
        // $ is short for window.jQuery (dollar sign is a valid char for variable names).
        // $(...) is like document.querySelectorAll(...); Entries are decorated with jQuery methods.
        // Variables with a dollar sign is just a naming convention for jQueryElements.
        // $jQueryElement.get(0) is the HTMLElement.
        // $el.myfunc() is jQuery.prototype.myfunc($el, ...);
        //
        // http://youmightnotneedjquery.com/
        // http://blog.garstasio.com/you-dont-need-jquery/
        // https://github.com/oneuijs/You-Dont-Need-jQuery
        // https://github.com/jquery/jquery


        /**
         * Merges the contents of two or more objects together into the first object.
         *
         * @param {Object} out - An object to modify, with new properties/values.
         * @param {...Object} var_args - Objects to copy properties from (shallow).
         * @returns {Object} - The modified object, which was the first parameter.
         */
        var extend = function(out) {
            out = out || {};

            for (var i = 1; i < arguments.length; i++) {
                if (!arguments[i]) continue;

                for (var key in arguments[i]) {
                    if (arguments[i].hasOwnProperty(key)) {
                        out[key] = arguments[i][key];
                    }
                }
            }
            return out;
        };

        /**
         * Creates an HTMLElement (or a doc fragment) from a raw HTML string.
         */
        var createElementFromHtml = function(s) {
            var frag = document.createDocumentFragment();
            var el = document.createElement('div');
            el.innerHTML = s;
            if (el.children.length == 1) return el.childNodes[0];

            while (el.childNodes[0]) {
              frag.appendChild(el.childNodes[0]);
            }
            return frag;
        };

        var isVisible = function(el) {
            var compStyle = window.getComputedStyle(el);
            if (compStyle.getPropertyValue("opacity") == 0) return false;

            return (el.offsetWidth > 0 || el.offsetHeight > 0);
        };

        return (function() {
            var containerElement;
            var listener;
            var toastId = 0;
            var toastType = {
                error: 'error',
                info: 'info',
                success: 'success',
                warning: 'warning'
            };

            var toastState = {
                init: 'init',
                showing: 'showing',
                shown: 'shown',
                hiding: 'hiding',
                closing: 'closing',
                removed: 'removed'
            };

            var toastr = {
                clear: clear,
                remove: remove,
                error: error,
                getContainer: getContainer,
                info: info,
                options: {},
                subscribe: subscribe,
                success: success,
                version: '2.1.2, minus jQuery',
                warning: warning
            };

            var previousToastMessage;

            return toastr;

            ////////////////

            function error(message, title, optionsOverride) {
                return notify({
                    type: toastType.error,
                    iconClass: getOptions().iconClasses.error,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function getContainer(options, create) {
                if (!options) { options = getOptions(); }
                var containerElement = document.getElementById(options.containerId);
                if (containerElement) {
                    return containerElement;
                }
                if (create) {
                    containerElement = createContainer(options);
                }
                return containerElement;
            }

            function info(message, title, optionsOverride) {
                return notify({
                    type: toastType.info,
                    iconClass: getOptions().iconClasses.info,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function subscribe(callback) {
                listener = callback;
            }

            function success(message, title, optionsOverride) {
                return notify({
                    type: toastType.success,
                    iconClass: getOptions().iconClasses.success,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function warning(message, title, optionsOverride) {
                return notify({
                    type: toastType.warning,
                    iconClass: getOptions().iconClasses.warning,
                    message: message,
                    optionsOverride: optionsOverride,
                    title: title
                });
            }

            function clear(toastElement, clearOptions) {
                var options = getOptions();
                if (!this.containerElement) { this.containerElement = getContainer(options); }
                if (!clearToast(toastElement, options, clearOptions)) {
                    clearContainer(options);
                }
            }

            function remove(toastElement) {
                var options = getOptions();
                if (!this.containerElement) { this.containerElement = getContainer(options); }
                if (toastElement && toastElement.querySelectorAll(':focus').length === 0) {
                    removeToast(toastElement);
                    return;
                }
                if (this.containerElement.children.length) {
                    if (this.containerElement.parentElement) this.containerElement.parentElement.removeChild(this.containerElement);
                }
            }

            // Internal functions.

            function clearContainer(options) {
                var toastsToClear = this.containerElement.children;
                for (var i = toastsToClear.length - 1; i >= 0; i--) {
                    clearToast(toastsToClear[i], options);
                }
            }

            function clearToast(toastElement, options, clearOptions) {
                var force = clearOptions && clearOptions.force ? clearOptions.force : false;
                if (toastElement && (force || toastElement.querySelectorAll(':focus').length === 0)) {
                    // Wrong scope for currentEffect/response.state. Don't do a hide transition. :/

                    removeToast(toastElement);
                    return true;
                }
                return false;
            }

            function createContainer(options) {
                var containerElement = document.createElement('div');
                containerElement.setAttribute('id', options.containerId);
                containerElement.classList.add(options.positionClass);
                containerElement.setAttribute('aria-live', 'polite');
                containerElement.setAttribute('role', 'alert');

                document.querySelector(options.target).appendChild(containerElement);
                return containerElement;
            }

            function getDefaults() {
                return {
                    tapToDismiss: true,
                    toastClass: 'toast',
                    containerId: 'toast-container',
                    debug: false,

                    onShown: undefined,
                    onHidden: undefined,

                    showTransitionClass: 'toast-fade-transition',
                    showHiddenClass: 'toast-fade-hidden',

                    hideTransitionClass: 'toast-fade-transition',
                    hideHiddenClass: 'toast-fade-hidden',

                    closeTransitionClass: undefined,
                    closeHiddenClass: undefined,

                    extendedTimeOut: 1000,
                    iconClasses: {
                        error: 'toast-error',
                        info: 'toast-info',
                        success: 'toast-success',
                        warning: 'toast-warning'
                    },
                    iconClass: 'toast-info',
                    positionClass: 'toast-top-right',
                    timeOut: 5000, // Set timeOut and extendedTimeOut to 0 to make it sticky
                    titleClass: 'toast-title',
                    messageClass: 'toast-message',
                    escapeHtml: false,
                    target: 'body',
                    closeHtml: '<button type="button">&times;</button>',
                    newestOnTop: true,
                    preventDuplicates: false,
                    progressBar: false
                };
            }

            function publish(args) {
                if (!listener) { return; }
                listener(args);
            }

            function notify(map) {
                var options = getOptions();
                var iconClass = map.iconClass || options.iconClass;

                if (typeof (map.optionsOverride) !== 'undefined') {
                    options = extend(options, map.optionsOverride);
                    iconClass = map.optionsOverride.iconClass || iconClass;
                }

                if (shouldExit(options, map)) { return; }

                toastId++;

                this.containerElement = getContainer(options, true);

                var hideTimeoutId = null;
                var toastElement = document.createElement('div');
                var titleElement = document.createElement('div');
                var messageElement = document.createElement('div');
                var progressElement = document.createElement('div');
                var closeElement = createElementFromHtml(options.closeHtml);
                var progressBar = {
                    intervalId: null,
                    hideEta: null,
                    maxHideTime: null
                };
                var response = {
                    toastId: toastId,
                    state: toastState.init,
                    startTime: new Date(),
                    options: options,
                    map: map
                };

                var currentEffect = {transitionClass:options.showTransitionClass, hiddenClass:options.showHiddenClass};

                personalizeToast();

                displayToast();

                handleEvents();

                publish(response);

                if (options.debug && console) {
                    console.log(response);
                }

                return toastElement;

                function escapeHtml(source) {
                    if (source == null)
                        source = "";

                    return new String(source)
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }

                function personalizeToast() {
                    setIcon();
                    setTitle();
                    setMessage();
                    setCloseButton();
                    setProgressBar();
                    setSequence();
                }

                function handleEvents() {
                    toastElement.addEventListener("mouseover", stickAround);
                    toastElement.addEventListener("mouseout", delayedHideToast);

                    if (options.closeButton && closeElement) {  // TODO: A closeElement test?
                        closeElement.addEventListener("click", function (event) {
                            if (event.stopPropagation) {
                                event.stopPropagation();
                            } else if (event.cancelBubble !== undefined && event.cancelBubble !== true) {
                                event.cancelBubble = true;
                            }
                            hideToast(true);
                        });
                    }

                    if (options.onclick || options.tapToDismiss) {
                        toastElement.addEventListener("click", function (event) {
                            if (response.state == toastState.closing) return;

                            if (options.onclick) {
                                options.onclick(event);
                                hideToast(false);
                            } else if (options.tapToDismiss) {
                                hideToast(true);
                            }
                        });
                    }
                }

                function displayToast() {
                    // Trigger a reflow to apply all pending DOM/CSS changes.
                    // Old/new CSS values need to be in separate batches for transitions to work.

                    toastElement.addEventListener("transitionend", transitionCallback);
                    response.state = toastState.showing;

                    currentEffect.transitionClass = options.showTransitionClass;
                    currentEffect.hiddenClass = options.showHiddenClass;

                    // Set a numeric hax-height to make slide down transitions work.
                    toastElement.style.maxHeight = window.getComputedStyle(toastElement).getPropertyValue("height");

                    toastElement.classList.add(currentEffect.hiddenClass);     // Hide.

                    var _ = toastElement.offsetTop;  // Reflow.
                    toastElement.classList.add(currentEffect.transitionClass);
                    toastElement.classList.remove(currentEffect.hiddenClass);  // Unhide.

                    if (options.timeOut > 0) {
                        hideTimeoutId = setTimeout(hideToast, options.timeOut);
                        progressBar.maxHideTime = parseFloat(options.timeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                        if (options.progressBar) {
                            progressBar.intervalId = setInterval(updateProgress, 10);
                        }
                    }

                }

                function setIcon() {
                    if (map.iconClass) {
                        toastElement.classList.add(options.toastClass);
                        toastElement.classList.add(iconClass);
                    }
                }

                function setSequence() {
                    if (options.newestOnTop) {
                        this.containerElement.insertBefore(toastElement, this.containerElement.firstChild);
                    } else {
                        this.containerElement.appendChild(toastElement);
                    }
                }

                function setTitle() {
                    if (map.title) {
                        if (!options.escapeHtml) {
                            titleElement.appendChild(createElementFromHtml(map.title));
                        } else {
                            titleElement.textContent = escapeHtml(map.title);
                        }
                        titleElement.classList.add(options.titleClass);
                        toastElement.appendChild(titleElement);
                    }
                }

                function setMessage() {
                    if (map.message) {
                        if (!options.escapeHtml) {
                            messageElement.appendChild(createElementFromHtml(map.message));
                        } else {
                            messageElement.textContent = escapeHtml(map.message);
                        }
                        messageElement.classList.add(options.messageClass);
                        toastElement.appendChild(messageElement);
                    }
                }

                function setCloseButton() {
                    if (options.closeButton) {
                        closeElement.classList.add('toast-close-button');
                        closeElement.setAttribute('role', 'button');
                        toastElement.insertBefore(closeElement, toastElement.firstChild);
                    }
                }

                function setProgressBar() {
                    if (options.progressBar) {
                        progressElement.classList.add('toast-progress');
                        toastElement.insertBefore(progressElement, toastElement.firstChild);
                    }
                }

                function shouldExit(options, map) {
                    if (options.preventDuplicates) {
                        if (map.message === previousToastMessage) {
                            return true;
                        } else {
                            previousToastMessage = map.message;
                        }
                    }
                    return false;
                }

                function transitionCallback(e) {
                    // Several properties can transition simultaneously, triggering multiple times.
                    if (response.state == toastState.showing) {
                        if (options.onShown) options.onShown();
                        response.state = toastState.shown;
                    }
                    else if ((response.state == toastState.closing || response.state == toastState.hiding) && !isVisible(toastElement)) {
                        removeToast(toastElement);
                        if (options.onHidden) options.onHidden();

                        response.state = toastState.removed;
                        response.endTime = new Date();
                        publish(response);
                    }
                }

                function hideToast(override) {
                    if (response.state == toastState.closing || response.state == toastState.removed) return;
                    if (!document.body.contains(toastElement)) return;

                    // Unless override is true, having anything focused will abort the hide.
                    if (toastElement.querySelectorAll(':focus').length && !override) return;

                    var previousEffect = {transitionClass:currentEffect.transitionClass, hiddenClass:currentEffect.hiddenClass};
                    if (override && options.closeTransitionClass && options.closeHiddenClass) {
                        currentEffect.transitionClass = options.closeTransitionClass;
                        currentEffect.hiddenClass = options.closeHiddenClass;
                    } else {
                        currentEffect.transitionClass = options.hideTransitionClass;
                        currentEffect.hiddenClass = options.hideHiddenClass;
                    }
                    response.state = (override ? toastState.closing : toastState.hiding);

                    toastElement.classList.remove(previousEffect.transitionClass);
                    toastElement.classList.remove(previousEffect.hiddenClass);
                    var _ = toastElement.offsetHeight;
                    toastElement.classList.add(currentEffect.transitionClass);
                    toastElement.classList.add(currentEffect.hiddenClass);  // Hide.
                }

                function delayedHideToast() {
                    if (options.timeOut > 0 && options.extendedTimeOut > 0) {
                        window.clearTimeout(hideTimeoutId);
                        hideTimeoutId = setTimeout(hideToast, options.extendedTimeOut);
                        progressBar.maxHideTime = parseFloat(options.extendedTimeOut);
                        progressBar.hideEta = new Date().getTime() + progressBar.maxHideTime;
                    }
                }

                function stickAround() {
                    if (response.state == toastState.closing) return;

                    window.clearTimeout(hideTimeoutId);
                    hideTimeoutId = null;
                    progressBar.hideEta = 0;

                    toastElement.classList.remove(currentEffect.hiddenClass);  // Unhide.
                }

                function updateProgress() {
                    if (!document.body.contains(progressElement)) {
                        window.clearInterval(progressBar.intervalId);
                        progressBar.intervalId = null;
                        return;
                    }
                    var percentage = Math.max(((progressBar.hideEta - (new Date().getTime())) / progressBar.maxHideTime), 0) * 100;
                    progressElement.style.width = percentage + '%';
                }
            }

            function getOptions() {
                return extend({}, getDefaults(), toastr.options);
            }

            function removeToast(toastElement) {
                if (!this.containerElement) { this.containerElement = getContainer(); }

                if (toastElement.parentElement) toastElement.parentElement.removeChild(toastElement);
                toastElement = null;                           // TODO: Remove? This only nulls the arg.
                if (this.containerElement.children.length === 0) {
                    if (this.containerElement.parentElement) this.containerElement.parentElement.removeChild(this.containerElement);
                    previousToastMessage = undefined;
                }
            }

        })();
    }
)();
