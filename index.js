"use strict";

var Promise = require("bluebird");

var destinationDir = "repos";
/*
 * Replace with a GitHub Access Token for higher API rate limits.
 * You can generate on on https://github.com/settings/applications#personal-access-tokens
 */
var accessToken = undefined;

var http = require("http");
var https = require("https");
function httpsGet(options) {
	return new Promise(function(resolve, reject) {
		https.get(options, function(res) {
			if (res.statusCode >= 400) {
				promisifyReadableStream(res).then(function(data) {
					reject(res.statusCode + " " + http.STATUS_CODES[res.statusCode] + "\n" + data);
				}, function(err) {
					reject(err);
				});
				return;
			}
			resolve(res);
		}).on("error", function(err) {
			reject(err);
		});
	});
}

function promisifyReadableStream(stream) {
	return new Promise(function(resolve, reject) {
		var data = "";
		stream.on("data", function(d) {
			data += d;
		}).on("end", function() {
			resolve(data);
		}).on("error", function(err) {
			reject(err);
		});
	});
}

var url = require("url");
function get(path) {
	var options = url.parse("https://api.github.com" + path);
	options.headers = {
		"User-Agent": "github-backup",
		"Accept": "application/vnd.github.v3+json"
	};
	if (accessToken) {
		options["Authorization"] = "token " + accessToken;
	}

	return httpsGet(options).then(promisifyReadableStream).then(JSON.parse);
}

function getPublicUserRepos(user) {
	var userRepos = get("/users/" + user + "/repos").all();
	var orgRepos = get("/users/" + user + "/orgs").map(getOrgRepos).all();
	return Promise.join(userRepos, orgRepos, function(userRepos, orgRepos) {
		return userRepos.concat.apply(userRepos, orgRepos);
	});
}

function getOrgRepos(org) {
	return get("/orgs/" + org.login + "/repos");
}

var childProcess = require("child_process");
function exec(command, args, options) {
	return new Promise(function(resolve, reject) {
		options = options || {};
		options.stdio = ["ignore", process.stdout, process.stderr];
		childProcess.spawn(command, args, options).on("close", function(code) {
			if (code === 0) {
				resolve();
			} else {
				reject("Process exited with code " + code);
			}
		});
	});
}

var path = require("path");
var fs = Promise.promisifyAll(require("fs"));
function backupRepo(repo) {
	var url = repo.clone_url;
	var re = new RegExp("https://github\.com/([^/]+)/([^/]+)");
	var matches = url.match(re);
	var user = matches[1];
	var repoName = matches[2];
	var repoPath = path.join(destinationDir, user, repoName);

	return fs.statAsync(user).error(function() {
		return fs.mkdirAsync(user);
	}).then(function() {
		return fs.statAsync(repoPath);
	}).then(function() {
		console.log("Updating", url);
		return exec("git", ["remote", "update"], { cwd: repoPath });
	}, function(err) {
		console.log("Cloning", url);
		return exec("git", ["clone", "--mirror", url, repoPath]);
	});
}

function backupRepoSerialized(repo, promise) {
	if (promise) {
		return promise.then(function() {
			return backupRepo(repo);
		});
	} else {
		return backupRepo(repo);
	}
}

getPublicUserRepos("ericlathrop").then(function(repos) {
	var promise;
	for (var i = 0; i < repos.length; i++) {
		var repo = repos[i];
		promise = backupRepoSerialized(repo, promise);
	}
	return promise;
}, function(err) {
	console.error("Unhandled error:", err);
}).done();
