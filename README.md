# Ardent Collector

## About this software

The Ardent Collector gathers data submitted to the [Elite Dangerous Data Network](https://github.com/EDCD/EDDN).

Ardent has details for over 150,000,000 star systems and over 30,000,000 trade 
orders for commodities and information across markets on over 300,000 stations,
ports, settlements and fleet carriers throughout the galaxy, with millions of 
updates per day.

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

This software requires Node.js v24.11.0 or later. The recommended version is Node.js v24.x, as specified in the `.nvmrc` and `.node-version` files.
The project is tested in CI with Node.js v24.x and the latest LTS release (`lts/*`), and is expected to work with all of these versions.
Dependencies have been updated to ensure compatibility with the latest Node.js releases and modern JavaScript features.

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
