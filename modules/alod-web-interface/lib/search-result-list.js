/* global $ */

var Promise = require('bluebird')
var fetch = require('isomorphic-fetch')
var rdfFetch = require('rdf-fetch')
var RDF2h = require('rdf2h')
var SparqlClient = require('sparql-http-client')
var ClusterizePaging = require('./clusterize-paging')

SparqlClient.fetch = rdfFetch

function archivalResources (graph) {
  return graph
    .match(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://data.archiveshub.ac.uk/def/ArchivalResource')
    .map(function (triple) {
      return triple.subject
    })
}

function SearchResultList (options) {
  this.options = options || {}

  this.client = new SparqlClient({
    updateUrl: options.endpointUrl
  })

  this.renderer = new RDF2h(options.matchers)

  this.rows = []

  this.clusterize = new ClusterizePaging({
    rows: this.rows,
    scrollId: 'scrollArea',
    contentId: 'contentArea',
    dummyRow: SearchResultList.dummyRow,
    preload: options.preload,
    callbacks: {
      loadRows: this.loadRows.bind(this)
    }
  })
}

SearchResultList.prototype.search = function (query, offset) {
  var self = this

  this.query = query

  return this.resultLength().then(function (length) {
    return self.clusterize.init(length)
  })
}

SearchResultList.prototype.resultLength = function () {
  var query = this.options.countSparql.replace('${searchString}', this.query)

  return this.client.postQuery(query).then(function (res) {
    var triple = res.graph.match(null, 'http://example/query-base#numberOfResults').toArray().shift()

    if (!triple) {
      return 0
    }

    return parseInt(triple.object.nominalValue)
  })
}

SearchResultList.prototype.fetchPage = function (offset) {
  var query = this.options.searchSparql
    .replace('${searchString}', this.query)
    .replace('${offset}', offset)
    .replace('${limit}', 10)

  return this.client.postQuery(query).then(function (res) {
    return res.graph
  })
}

SearchResultList.prototype.loadRows = function (rows, offset) {
  var self = this

  return this.fetchPage(offset).then(function (page) {
    var subjects = archivalResources(page)

    subjects.forEach(function (subject, index) {
      /* var level = page.match(subject, 'http://data.archiveshub.ac.uk/def/level').toArray().shift()
      var title = page.match(subject, 'http://purl.org/dc/elements/1.1/title').toArray().shift()

      rows[offset + index] = '<tr><td><a href="' + subject.toString() + '">' + level.object.toString() + ' - ' + title.object.toString() + '</a></td></tr>' */

      rows[offset + index] = self.renderer.render(page, subject.toString())
    })

    return rows
  })
}

SearchResultList.dummyRow = '<tr><td><p></p></td></tr>'

// patch mediaType -> parser map
rdfFetch.defaults.formats.parsers['application/octet-stream'] = rdfFetch.defaults.formats.parsers['text/turtle']

Promise.all([
  fetch('search-result-list.sparql').then(function (res) {
    return res.text()
  }),
  fetch('search-result-list.count.sparql').then(function (res) {
    return res.text()
  }),
  rdfFetch('//rawgit.com/zazukoians/trifid-ld/master/data/public/rdf2h/matchers.ttl').then(function (res) {
    return res.graph
  })
  /* rdfFetch('//cdn.zazuko.com/rdf2h/rdf2h.github.io/v0.0.1/2015/rdf2h-points.ttl').then(function (res) {
    return res.graph
  }) */
]).spread(function (searchSparql, countSparql, matcher) {
  var list = new SearchResultList({
    endpointUrl: 'http://data.alod.ch/alod/sparql',
    searchSparql: searchSparql,
    countSparql: countSparql,
    preload: 30,
    matcher: matcher
  })

  $('#search').click(function () {
    list.search($('#query').val())
  })
})

