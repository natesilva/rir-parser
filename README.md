# rir-parser
    
    npm install rir-parser    
    
* **What it is:** A Node.js parser for RIR Statistics Files (IP address assignment by country, published daily by each Regional Internet Registry)
* **Why to use it:** This module can be part of a geo-IP system that maps IP addresses to the country in which they are located.
* **Why not to use it:** This is a low-level module that **does not include geo-IP** functionality. It’s an important building block for a geo-IP module, but does not itself provide that functionality (the author intends to publish such a module).

## More information
Five Regional Internet Registries ([AfriNIC](http://www.afrinic.net/), [APNIC](https://www.apnic.net/), [ARIN](https://www.arin.net/), [LACNIC](http://lacnic.net/) and [RIPENCC](http://www.ripe.net/)),  control the assignment of IP addresses worldwide.

These RIRs publish lists (called *RIR statistics*) showing which addresses have been assigned, and to which country they are assigned. These lists can be obtained from several locations, including the [Number Resource Organization](https://www.nro.net/statistics) and via FTP from [ARIN](ftp://ftp.arin.net/pub/stats) and [RIPE](ftp://ftp.ripe.net/pub/stats).

This module parses those lists, consolidating adjacent IPv4 ranges and returning a minimal list of IP ranges (both IPv4 and IPv6) and the country to which the range is assigned.

## Usage

This module exposes one class, `RirParser`, which is a Node.js [Transform stream](http://nodejs.org/api/stream.html#stream_class_stream_transform).

To use it, create an instance of `RirParser` and pipe the list to it. The `RirParser` will output a series of JavaScript objects of the form:

    {range: …, kind: ['ipv4'|'ipv6'], country: [two-letter country code]}

Example:

    var RirParser = require('rir-parser');

    var parser = new RirParser();

    parser.on('readable', function() {
      var ipRange;
      do {
        ipRange = parser.read();
        if (ipRange) { console.log(ipRange); }
      } while (ipRange);
    });

    someIncomingRirDataFileStream.pipe(parser);
    
