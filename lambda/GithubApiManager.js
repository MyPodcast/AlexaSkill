const fetch = require("node-fetch");
const { Octokit } = require("@octokit/core");

const token = "2e9f761a5d9699089cdca2679ce7512d7c45699b";
const gistId = "134e4361b752cfe71f4c7337d99a17bd";

const headers = { 'Authorization': 'Basic '+ token };

async function updatePodcasts(podcasts) {
  const octokit = new Octokit({ auth: token });
  const patch = await octokit.request(`PATCH /gists/{gist_id}`, {
    gist_id: gistId,
    description: "MyPodcast",
    files: { "podcasts.json": { content: JSON.stringify(podcasts) } },
  });
}

async function getPodcasts() {
  const octokit = new Octokit({ auth: token });
  const podcasts = await octokit.request(`GET /gists/{gist_id}`, {
    gist_id: gistId,
  });
  const requestOptions = {
    headers: {
      Authorization: "token " + token,
    },
    credentials: "same-origin",
    cache: "no-store",
  };

  fetch(podcasts.data.files["podcasts.json"].raw_url, requestOptions)
    .then((res) => res.json())
    .then(function (result) {
      console.log(result[0].name);
      return result;
    });
}

module.exports = { updatePodcasts, getPodcasts };

// connector = GithubApiManager.getInstance();
// connector.getPodcats().then(function (result) {
//   console.log(result);
// });
// console.log(restul);
// connector.updatePodcasts(podcasts);
