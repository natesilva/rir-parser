//
// Transform stream that parses an RIR statistics file.
//
// Outputs a series of JavaScript objects each listing an IP range
// and the corresponding country.
//
// The algorithm is adapted from the one found in rir2dns
// (http://sourceforge.net/projects/rir2dns/).
//
// The RIR statistics format is described at
// https://www.nro.net/statistics and daily statistics can be
// downloaded from that location, or from
// ftp://ftp.arin.net/pub/stats or ftp://ftp.ripe.net/pub/stats.
//

var Transform = require('stream').Transform;
var util = require('util');
var ip = require('ip');
var Promise = require('bluebird');

function RirParser() {
  Transform.call(this, {objectMode: true});

  this.line = '';
  this.staged = [];
  this.output = [];
}

util.inherits(RirParser, Transform);

RirParser.prototype._transform = function(chunk, encoding, callback) {
  chunk = chunk.toString();

  // process one complete line at a time
  while (chunk.length) {
    var newlinePos = chunk.indexOf('\n');

    if (newlinePos === -1) {
      this.line += chunk;
      break;
    }

    this.line += chunk.slice(0, newlinePos);
    this.parseLine(this.line);
    this.line = '';

    chunk = chunk.slice(newlinePos + 1);
  }

  while (this.output.length) {
    var pushMore = this.push(this.output.pop());
    if (!pushMore) { break; }
  }

  callback();
};

RirParser.prototype._flush = function(callback) {
  // handle any remaining partial line
  if (this.line.length) {
    this.parseLine(this.line);
    this.line = '';
  }

  // process all the IPv4 addresses we’ve been staging
  this.normalize(this).bind(this).then(function() {
    while (this.output.length) { this.push(this.output.pop()); }
  }).then(callback).error(callback);
};

RirParser.prototype.parseLine = function(line) {
  var parts = line.split('|');
  if (parts.length < 7) { return; }
  if (parts[2] !== 'ipv4' && parts[2] !== 'ipv6') { return; }
  if (parts[6] !== 'assigned' && parts[6] !== 'allocated') { return; }
  if (!parts[1]) { return; }  // skip lines with no country code

  switch (parts[2]) {
  case 'ipv6':
    var output = {
      range: parts[3] + '/' + parts[4],
      kind: 'ipv6',
      country: parts[1]
    };
    this.output.push(output);
    break;

  case 'ipv4':
    var start = ip.toLong(parts[3]);
    var end = start + parseInt(parts[4], 10);
    var range = { start: start, end: end, country: parts[1] };
    this.staged.push(range);
    break;
  }
};

// helper for normalize(): generates results for one IP range
RirParser.generateRange = function(range, pushTarget) {
  var start = range.start;
  var end = range.end;
  var country = range.country;

  var curr = start;

  // generate individual IPs at start of range
  var bordermask = ip.toLong('0.0.0.255');
  var endmask = ip.toLong('255.255.255.255');
  var increment = 1;
  while (curr < ((end & endmask) >>> 0) && ((curr & bordermask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '32', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate A networks at start of range
  bordermask = ip.toLong('0.0.255.255');
  endmask = ip.toLong('255.255.255.0');
  increment = 256;
  while (curr < ((end & endmask) >>> 0) && ((curr & bordermask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '24', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate B networks at start of range
  bordermask = ip.toLong('0.255.255.255');
  endmask = ip.toLong('255.255.0.0');
  increment = 65536;
  while (curr < ((end & endmask) >>> 0) && ((curr & bordermask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '16', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate C networks in middle of range
  bordermask = ip.toLong('255.255.255.255');
  endmask = ip.toLong('255.0.0.0');
  increment = 16777216;
  while (curr < ((end & endmask) >>> 0) && ((curr & bordermask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '8', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate B networks at end of range
  bordermask = ip.toLong('0.255.255.255');
  endmask = ip.toLong('255.255.0.0');
  increment = 65536;
  while (curr < ((end & endmask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '16', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate A networks at end of range
  bordermask = ip.toLong('0.0.255.255');
  endmask = ip.toLong('255.255.255.0');
  increment = 256;
  while (curr < ((end & endmask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '24', kind: 'ipv4', country: country}
    );
    curr += increment;
  }

  // generate individual IPs at end of range
  bordermask = ip.toLong('0.0.0.255');
  endmask = ip.toLong('255.255.255.255');
  increment = 1;
  while (curr < ((end & endmask) >>> 0)) {
    pushTarget.push(
      {range: ip.fromLong(curr) + '/' + '32', kind: 'ipv4', country: country}
    );
    curr += increment;
  }
};

// call this only after all IPv4 addresses have been collected
RirParser.prototype.normalize = function(pushTarget) {
  // sort in descending order
  this.staged.sort(function(a, b) { return b.start - a.start; });

  // glue together consecutive ranges
  var ranges = [];
  var range;
  while (this.staged.length) {
    var item = this.staged.pop();
    if (!range) {
      range = item;
    } else if (range.end === item.start && range.country === item.country) {
      range.end = item.end;
    } else {
      ranges.push(range);
      range = item;
    }
  }
  if (range) { ranges.push(range); }

  // Iterate over each range, synchronously generating output.
  // Periodically use setImmediate() to yield the event loop.
  var index = 0;
  return Promise.each(ranges, function(range) {
    return new Promise(function(resolve) {
      if (++index % 100 === 0) {
        setImmediate(function() {
          RirParser.generateRange(range, pushTarget);
          resolve();
        });
      } else {
        RirParser.generateRange(range, pushTarget);
        resolve();
      }
    });
  });
};

module.exports = RirParser;
