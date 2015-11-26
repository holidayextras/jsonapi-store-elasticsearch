"use strict";
var async = require("async");
var JsonapiStoreElasticsearch = require("..");
var instances = [ ];

// Replace the MemoryStore default handler with our own version
require("jsonapi-server/lib/MemoryHandler");
module.children[2].exports = function() {
  var dbStore = new JsonapiStoreElasticsearch({
    host: "localhost:9200"
  });
  // Keep the handler around for after the test rig is live
  instances.push(dbStore);
  return dbStore;
};

var jsonApiTestServer = require("jsonapi-server/example/server.js");
jsonApiTestServer.start();

// Before starting the test suite, load all example resouces, aka
// the test fixtures, into the databases
setTimeout(function() {
  async.map(instances, function(dbStore, callback) {
    dbStore.populate(callback);
  });
}, 2000);
