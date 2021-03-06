import { Octokit } from '@octokit/rest';
import * as semver from 'semver';

module.exports.fetchPreviousVersion = async function(base: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN must be set');
  }

  const github = new Octokit({ auth: token });
  const releases = await github.repos.listReleases({
    owner: 'aws',
    repo: 'aws-cdk',
  });

  // this returns a list in descending order, newest releases first
  // opts for same major version where possible, falling back otherwise
  // to previous major versions.
  let previousMVRelease = undefined;
  for (const release of releases.data) {
    const version = release.name?.replace('v', '');
    if (version && semver.lt(version, base)) {
      if (semver.major(version) === semver.major(base)) {
        return version;
      } else if (!previousMVRelease) {
        previousMVRelease = version;
      }
    }
  }
  if (previousMVRelease) { return previousMVRelease; }

  throw new Error(`Unable to find previous version of ${base}`);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('make-runnable/custom')({
  printOutputFrame: false,
});
