'use strict';

// Testcase to produce NodeReport on uncaught exception
if (process.argv[2] === 'child') {
  require('../').setEvents('exception');

  function myException(request, response) {
    const m = '*** exception.js: testcase exception thrown from myException()';
    throw new UserException(m);
  }

  function UserException(message) {
    this.message = message;
    this.name = 'UserException';
  }

  myException();
} else {
  const common = require('./common.js');
  const spawn = require('child_process').spawn;
  const tap = require('tap');

  const child = spawn(process.execPath, [__filename, 'child']);
  child.on('exit', (code, signal) => {
    const expectedExitCode = process.platform === 'win32' ? 3221225477 : null;
    const expectedSignal = process.platform === 'win32' ? null : 'SIGILL';
    tap.plan(4);
    tap.equal(code, expectedExitCode, 'Process should not exit cleanly');
    tap.equal(signal, expectedSignal,
              'Process should exit with expected signal ');
    const reports = common.findReports(child.pid);
    tap.equal(reports.length, 1, 'Found reports ' + reports);
    const report = reports[0];
    common.validate(tap, report, child.pid);
  });
}
