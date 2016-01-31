ReadNoEvil
==========

Background
----------

When you block someone on Twitter, you may still see their messages. In search results. Or even your own timeline, if someone else retweets/quotes them.

Users discovered a simple CSS workaround, since tweets are internally flagged as to whether you're blocking the author.

* [Link](http://blog.randi.io/2016/01/13/hiding-blocked-users-from-twitter-search/): AdBlock
* [Link](https://twitter.com/cdaveross/status/687547100947550208): uBlock
* [Link](https://gist.github.com/CrystalDave/2b11c05c87005cc0f29c): GreaseMonkey/TamperMonkey

However Tweetdeck does *not* have that flag. Third party scripts don't have an easy way to identify and remove unwanted tweets.


About
-----

This extension fixes Tweetdeck the hard way. It connects to Twitter - acting as an app - to fetch a list of blocked user ids. Whenever you're on Tweetdeck or Twitter.com, this extension will monitor the page, check the list, and redact any tweets that contain a match.


Setup
-----

Go to [chrome://extensions/](chrome://extensions/) and bring up the options for this extension.

In order to connect to Twitter on your behalf, you'll need to do a one-time PIN authorization. After that, click the "Fetch Current Block List" button.

Note: If your block list is enormous, fetching my take several minutes. Twitter's servers insert a delay after every 75,000 entries. This happens in the background, so you can safely switch to more interesting tabs.

Any time you're on Tweetdeck or Twitter.com, a clickable-icon will appear in the address bar to toggle redaction.


Installing a GitHub Snapshot
----------------------------

Google only allows packaged extensions to be installed via the web store. This is a safety measure for end-users.

Developers can load the source directly, by doing the following.

* Save the chrome folder from this repository somewhere on your hard drive.
* Go to [chrome://extensions/](chrome://extensions/)
* Enable "Developer Mode".
* Click "Load unpacked extension" and choose that folder.

This method is not recommended for everyday use, as Chrome will nag on startup to disable such extensions.
