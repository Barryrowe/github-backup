"use strict";

var Promise = require("bluebird"); // jshint ignore:line

/*
 * A GitHub Access Token for higher API rate limits.
 * You can generate on on https://github.com/settings/applications#personal-access-tokens
 */
var accessToken = process.env.GITHUB_ACCESS_TOKEN;

var promisify = require("./promisify");

var url = require("url");
function get(path) {
	var options = url.parse("https://api.github.com" + path);
	options.headers = {
		"User-Agent": "github-backup",
		"Accept": "application/vnd.github.v3+json"
	};
	if (accessToken) {
		options.Authorization = "token " + accessToken;
	}

	return promisify.httpsGet(options).then(promisify.readableStream).then(JSON.parse);
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

module.exports = {
	getPublicUserRepos: getPublicUserRepos
};
