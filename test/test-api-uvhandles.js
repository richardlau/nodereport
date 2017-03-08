'use strict';

// Testcase to check reporting of uv handles.
if (process.argv[2] === 'child') {
  // Exit on loss of parent process
  const exit = () => process.exit(2);
  process.on('disconnect', exit);

  const fs = require('fs');
  const http = require('http');
  const node_report = require('../');

  // Watching files should result in fs_event/fs_poll uv handles.
  const watcher = fs.watch(__filename);
  fs.watchFile(__filename, () => {});

  // Simple server/connection to create tcp uv handles.
  const server = http.createServer((req, res) => {
    req.on('end', () => {
      // Generate the report while the connection is active.
      console.log(node_report.getReport());

      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end();

      // Tidy up to allow process to exit cleanly.
      server.close(() => {
        watcher.close();
        fs.unwatchFile(__filename);
        process.removeListener('disconnect', exit);
      });
    });
    req.resume();
  });
  server.listen(() => {
    http.get({port: server.address().port});
  });
} else {
  const common = require('./common.js');
  const fork = require('child_process').fork;
  const tap = require('tap');

  const options = { encoding: 'utf8', silent: true };
  const child = fork(__filename, ['child'], options);
  var stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  var stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.on('exit', (code, signal) => {
    tap.plan(11);
    tap.strictSame(code, 0, 'Process should exit with expected exit code');
    tap.strictSame(signal, null, 'Process should exit cleanly');
    tap.strictSame(stderr, '', 'Checking no messages on stderr');
    const reports = common.findReports(child.pid);
    tap.same(reports, [], 'Checking no report files were written');

    // uv handle specific tests.
    const address_re_str = '\\b(?:0+x)?[0-9a-fA-F]+\\b'
    // fs_event and fs_poll handles for file watching.
    // libuv returns file paths on Windows starting with '\\?\'.
    const summary = common.getSection(stdout, 'Node.js libuv Handle Summary');
    const fs_event_re = new RegExp('\\[RA]\\s+fs_event\\s+' + address_re_str +
                                   '\\s+filename: (\\\\\\\\\\\?\\\\)?' +
                                   __filename.replace(/\\/g,'\\\\'));
    tap.match(summary, fs_event_re, 'Checking fs_event uv handle');
    const fs_poll_re = new RegExp('\\[RA]\\s+fs_poll\\s+' + address_re_str +
                                  '\\s+filename: (\\\\\\\\\\\?\\\\)?' +
                                  __filename.replace(/\\/g,'\\\\'));
    tap.match(summary, fs_poll_re, 'Checking fs_poll uv handle');

    // pipe handle for the IPC channel used by child_process_fork().
    const pipe_re = new RegExp('\\[RA]\\s+pipe\\s+' + address_re_str +
                               '.+\\breadable\\b\\s+\\bwritable\\b');
    tap.match(summary, pipe_re, 'Checking pipe uv handle');

    // tcp handles. The report should contain three sockets:
    // 1. The server's listening socket.
    // 2. The inbound socket making the request.
    // 3. The outbound socket sending the response.
    const tcp_re = new RegExp('\\[RA]\\s+tcp\\s+' + address_re_str +
                               '\\s+\\S+:(\\d+) \\(not connected\\)');
    tap.match(summary, tcp_re, 'Checking listening socket tcp uv handle');
    const port = tcp_re.exec(summary)[1];
    const out_tcp_re = new RegExp('\\[RA]\\s+tcp\\s+' + address_re_str +
                                  '\\s+\\S+:\\d+ connected to \\S+:'
                                  + port + '\\b');
    tap.match(summary, out_tcp_re,
              'Checking inbound connection tcp uv handle');
    const in_tcp_re = new RegExp('\\[RA]\\s+tcp\\s+' + address_re_str +
                                 '\\s+\\S+:' + port +
                                 ' connected to \\S+:\\d+\\b');
    tap.match(summary, in_tcp_re,
              'Checking outbound connection tcp uv handle');

    // Common report tests.
    tap.test('Validating report content', (t) => {
      common.validateContent(stdout, t, {pid: child.pid,
        commandline: child.spawnargs.join(' ')
      });
    });
  });
}
