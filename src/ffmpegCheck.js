import { execFile } from 'node:child_process';

export function checkFfmpeg() {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-version'], (err, stdout) => {
      if (err) {
        reject(
          new Error(
            'ffmpeg is not available on PATH. Install ffmpeg before starting stream-describer.'
          )
        );
        return;
      }
      resolve(stdout.split('\n')[0]);
    });
  });
}
