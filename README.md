ReadNoEvil
==========

Background
----------

When you block someone on Twitter, you may still see their messages. In search results. Or even your own timeline, if someone else retweets/quotes them.

Users discovered a simple CSS workaround, since tweets are internally flagged as to whether you're blocking the author.

* [link](http://blog.randi.io/2016/01/13/hiding-blocked-users-from-twitter-search/) AdBlock
* [link](https://twitter.com/cdaveross/status/687547100947550208) uBlock
* [link](https://gist.github.com/CrystalDave/2b11c05c87005cc0f29c) GreaseMonkey/TamperMonkey

However Tweetdeck does *not* have that flag. As a consequence, its AJAX interface includes a menu item to block, but it never knows when to provide an UN-block option. This also means third party scripts don't have an easy way to identify and remove unwanted tweets.

About
-----

This extension fixes Tweetdeck it the hard way. It connects to Twitter - acting as an app - to fetch a list of blocked user ids. Whenever you're using Tweetdeck, this extension will monitor the page, scrape user ids, check the list, and redact any tweets that contain a match.


Setup
-----

In order to connect to Twitter on your behalf, you'll first need to bring up this extension's options. Then do a one-time PIN authorization. After that, click the "Fetch Current Block List" button whenever you need to.

Any time you're on Tweetdeck, an icon will appear in the address bar to toggle redaction.
