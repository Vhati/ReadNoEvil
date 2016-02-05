var RNE = RNE || {};

RNE.dialog = RNE.dialog || (function() {
	// Private

	// Public
	return {
		/**
		 * Shows a disposable message box.
		 *
		 * @param {string} dialogTitle - Text to display in the title bar.
		 * @param {string} dialogWidth - A CSS width value for the dialog (including unit suffix).
		 * @param {string[]} messageLines - A list of paragraphs' text.
		 */
		showMessageBox: function(dialogTitle, dialogWidth, messageLines) {

			// A 'lightbox' behind the dialog, filling the viewport to intercept and ignore clicks.

			var viewportDiv = document.createElement("div");
			viewportDiv.setAttribute("style", "position:absolute; width:100%; height:100%; z-index:2000; background-color:rgba(255,255,255,0.6);");
			viewportDiv.style.top = window.pageYOffset +"px";
			viewportDiv.style.left = window.pageXOffset +"px";

			var glassPaneFrame = document.createElement("iframe");
			glassPaneFrame.setAttribute("style", "position:absolute; width:100%; height:100%;");
			viewportDiv.appendChild(glassPaneFrame);


			// The dialog itself.

			var dialogDiv = document.createElement("div");
			dialogDiv.setAttribute("style", "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:2001; border:1px solid rgb(51,102,153); background-color:rgb(255,255,255);");
			dialogDiv.style.width = dialogWidth;

			var titlebarDiv = document.createElement("div");
			titlebarDiv.setAttribute("style", "width:100%; box-sizing:border-box; padding:2px 4px 2px 8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgb(41,47,51); font-weight:bold; font-size:80%; color:white; background-color:rgb(85,172,238);");
			titlebarDiv.textContent = dialogTitle;
			dialogDiv.appendChild(titlebarDiv);

			var dismissDiv = document.createElement("div");
			dismissDiv.setAttribute("style", "width:3ch; height:0.9em; cursor:pointer; display:table; border:1px solid black; color:black; background-color:rgb(212,208,200);");
			titlebarDiv.appendChild(dismissDiv);

			var dismissTextDiv = document.createElement("div");
			dismissTextDiv.setAttribute("style", "display:table-cell; text-align:center; vertical-align:middle;");
			dismissTextDiv.textContent = "X";
			dismissDiv.appendChild(dismissTextDiv);

			dismissDiv.addEventListener("click", function() {
				document.body.removeChild(viewportDiv);
				viewportDiv.removeChild(dialogDiv);
			});

			var contentDiv = document.createElement("div");
			contentDiv.setAttribute("style", "width:100%; height:100%; box-sizing:border-box; padding:10px; overflow:auto; text-align:center;");

			var textDiv = document.createElement("div"); 

			for (var i=0; i < messageLines.length; i++) {
				var linePara = document.createElement("p");
				linePara.setAttribute("style", "margin:0.4em;");
				linePara.textContent = messageLines[i];
				textDiv.appendChild(linePara);
			}

			contentDiv.appendChild(textDiv);
			dialogDiv.appendChild(contentDiv);

			document.body.appendChild(viewportDiv);
			viewportDiv.appendChild(dialogDiv);
		}
	};
})();