"use strict";
var async = require("async");
var JsonapiStoreElasticsearch = require("..");
var instances = [ ];

// Replace the MemoryStore default handler with our own version
require("jsonapi-server/lib/MemoryHandler");
module.children[2].exports = function() {
  var dbStore = new JsonapiStoreElasticsearch({
    host: "http://localhost:9200"
  });
  // Keep the handler around for after the test rig is live
  instances.push(dbStore);
  return dbStore;
};

// Load the jsonapi-server test suite
var fs = require("fs");
var path = require("path");
var base = path.join(__dirname, "../node_modules/jsonapi-server/test");
fs.readdirSync(base).forEach(function(filename) {
  require(path.join(base, filename));
});

// Before starting the test suite, load all example resouces, aka
// the test fixtures, into the databases
before(function(done) {
  setTimeout(function() {
    async.map(instances, function(dbStore, callback) {
      dbStore.populate(callback);
    }, done);
  }, 2000);
});
