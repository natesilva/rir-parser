// Example: Downloads the latest RIR data containing all assigned IP
// addresses in Africa. Parses it and produces a report by country.

var RirParser = require('..');  // in your own app: require('rir-parser')
var countries = require('country-data').countries;
var JSFtp = require('jsftp');

// object that holds the output results
var report = {};

// create an RirParser and handlers
var parser = new RirParser();

// read IP ranges from the parser and accumulate results
parser.on('readable', function() {
  var ipRange;
  do {
    ipRange = parser.read();

    if (ipRange) {

      if (!(ipRange.country in report)) {
        report[ipRange.country] = {
          name: countries[ipRange.country].name,
          ipv4: 0,
          ipv6: 0
        };
      }

      switch(ipRange.kind) {
      case 'ipv4':
        report[ipRange.country].ipv4++;
        break;

      case 'ipv6':
        report[ipRange.country].ipv6++;
        break;
      }
    }
  } while (ipRange);
});

// when everything has been parsed, print the report
parser.on('end', function() {
  console.log('IP ADDRESS RANGE ASSIGNMENT BY COUNTRY (AFRICA)\n');

  var grandTotalIpv4 = 0;
  var grandTotalIpv6 = 0;

  // sort by country code
  var countryCodes = Object.keys(report);
  countryCodes.sort(function(a, b) {
    if (report[a].name < report[b].name) { return -1; }
    if (report[b].name < report[a].name) { return 1; }
    return 0;
  });

  var padLeft = function(text, length) {
    return ((Array(length).join(' ') + text).slice(-length));
  };

  var padRight = function(text, length) {
    return ((text + Array(length).join(' ')).slice(0, length));
  };

  var formatCountryData = function(data){
    var countryName = padRight(data.name, 32);
    var ipv4 = padRight('IPv4: ' + padLeft(data.ipv4.toString(10), 7), 14);
    var ipv6 = padRight('IPv6: ' + padLeft(data.ipv6.toString(10), 7), 14);
    var total = 'Total: ' + padLeft((data.ipv4 + data.ipv6).toString(10), 7);
    return countryName + ' ' + ipv4 + ipv6 + total;
  };

  countryCodes.forEach(function(countryCode) {
    var data = report[countryCode];

    grandTotalIpv4 += data.ipv4;
    grandTotalIpv6 += data.ipv6;

    console.log(formatCountryData(data));
  });

  var data = {name: 'GRAND TOTAL', ipv4: grandTotalIpv4, ipv6: grandTotalIpv6};
  console.log('\n' + formatCountryData(data));
});

// open an FTP connection to get the data, and pipe it to the parser
var FTP_CONFIG = { host: 'ftp.arin.net' };
var RIR_FILE = '/pub/stats/afrinic/delegated-afrinic-latest';

var ftp = new JSFtp(FTP_CONFIG);
ftp.get(RIR_FILE, function(err, socket) {
  if (err) { return console.error(err); }
  console.log('>>> getting RIR data for AfriNIC from the ARIN FTP server\n');
  socket.pipe(parser);
  socket.resume();
  socket.on('close', function() { ftp.raw.quit(); });
});
