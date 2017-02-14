'use strict';

const common = require('./common.js');
const nodereport = require('..');
const os = require('os');
const tap = require('tap');

const report_str = nodereport.getReport();
const machine_str = report_str.match(/Machine: .*(?:\r*\n)/);

tap.match(machine_str, new RegExp('Machine: ' + os.hostname()),
          'Machine contains hostname');

