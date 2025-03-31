# Ardent Collector

## About this software

The Ardent Collector gathers data submitted to the Elite Dangerous Data Network.

Ardent has details for over 110,000,000 star systems, over 30,000,000 trade 
orders for commodities and information on over 300,000 stations, ports, 
settlements and fleet carriers throughout the galaxy.

The Ardent Collector writes data it gathers to relational databases and 
generates reports from the data (e.g. summaries of commodity supply and demand 
and trade reports for different regions) and provides access to the data via 
the [Ardent API](https://github.com/iaincollins/ardent-api) and raw data dumps.

Related repositories:

* https://github.com/iaincollins/ardent-www
* https://github.com/iaincollins/ardent-api
* https://github.com/iaincollins/ardent-auth

## Notes

This software assumes an internet connection as it attempts to connect to the 
the EDDN (Elite Dangerous Data Network) ZeroMQ instance at 
tcp://eddn.edcd.io:9500 at startup to receive a data stream.

Because of this, and other dependancies, it is build against Node.js v18.x,
an older LTS release that is end-of-life 2025-04-30 and may not work with 
other versions of Node.js.

After doing `npm install` you can run the service with `npm start`.

You may need to run `npm run stats` least once to generate cached data and 
avoid errors being displayed at start up, but this is a scheduled task and
will happen automatically eventually if you leave the service running for 
long enough.

## Credits

_This software would not be possible without work from dozens of enthusiasts 
and hundreds of open source contributors._

Special thanks to Elite Dangerous Community Developers members, Elite 
Dangerous Data Network maintainers, Anthor (Elite Dangerous Star Map) 
and Gareth Harper (Spansh).

Thank you to all those who have created and supported libraries on which this 
software depends and to Frontier Developments plc for supporting third party 
tools.

## Legal

Copyright Iain Collins, 2023.

This software has been released under the GNU Affero General Public License.

Elite Dangerous is copyright Frontier Developments plc. This software is 
not endorsed by nor reflects the views or opinions of Frontier Developments and 
no employee of Frontier Developments was involved in the making of it.
