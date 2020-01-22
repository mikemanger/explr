/*requires:
api/lastfm.js
*/

var api = api || {};
var superCount = 0;

(function(window, document) {
	d3.csv("assets/data/countries.csv", function(err, data) {
		alias = d3.nest()
			.key(function(d) {
				if (d && d.tag) {
					return d.tag.toLowerCase();
				} else {
					return "";
				}
			})
			.map(data);

		cname = d3.nest()
			.key(function(d) {
				return d.name.toLowerCase();
			})
			.map(data);

		/**
		 * Tries to find out the country for a specified artist.
		 * @param  {String}   artist   Name of the artist to get country for
		 * @param  {Function} callback Callback function, called when the search is over (whether a country's been found or not)
		 *                             The callback function takes one argument, this object:
		 *
		 *                             {
		 *                             	"artist": <artist name>,
		 *                             	"country": <country name>,
		 *                             	"id": <country id>,
		 *                             	"tag": <the tag that decided the country (e.g. Swedish for Sweden)>
		 *                             }
		 *
		 * 								If no country could be found, "country", "tag" and "id" are undefined.
		 *
		 */
		api.getCountry = function(artist, callback) {
			// Get artists country code here, from last.fm or whatever
			api.lastfm.send("artist.gettoptags", [["artist", artist]], function(err,
				responseData2) {
				var running = true; // To stop searching when a country-tag has been found

				// Return if something failed
				if (err || !responseData2.toptags || !responseData2.toptags.tag || !
					responseData2.toptags.tag.length) {
					callback({
						"artist": artist
					});
					return;
				}


				//Spara tillfälligt bästa träffen
				var tempCid;
				var tempCountryname;
				var tname;
				var troubleFound;

				// Else check for country-tags in the artist's tags
				responseData2.toptags.tag.forEach(function (t, i) {
					if (running) {
						tname = t.name.toLowerCase();
						var cid;

						//Lista med taggar vi vill dubbelkolla
						var troubleCountries = ["georgia", "ireland"];
						var troubleLanguages = ["spanish", "french", "english", "portuguese", "russian", "italian", "japanese", "korean", "indian", "swedish", "irish"];
						
						try { //Testar taggen mot landsnamn
							if (cname[tname] && cname[tname][0].id) { // sweden->sweden
								//Kollar lista med specialfall som ofta blir fel
								troubleFound = false;
								for (i = 0; i < troubleCountries.length; i++) {
									if (cname[tname][0].name.toLowerCase() == troubleCountries[i]) {
										troubleFound = troubleCountries[i];
									}
								}
								if (!troubleFound) { //Den här taggen är inget problem, fortsätt som vanligt
										cid = cname[tname][0].id; 
										countryName = cname[tname][0].name;
								} else { //Den här taggen finns med i listan, spara den temporärt och se om vi hittar något bättre!
									tempCid = cname[tname][0].id;
									tempCountryname = cname[tname][0].name;
									//console.log("Trouble found!     " + tname);
								}

							//Testar taggen mot demonymer
							} else if (alias[tname] && alias[tname][0].id) { // swedish->sweden
								
								troubleFound = false;
								for (i = 0; i < troubleLanguages.length; i++) {
									if (alias[tname][0].tag.toLowerCase() == troubleLanguages[i]) {
										troubleFound = troubleLanguages[i];
									}
								}
								if (!troubleFound) { //Den här taggen är inget problem, fortsätt som vanligt
										cid = alias[tname][0].id;
										countryName = alias[tname][0].name;
								} else { //Den här taggen finns med i listan, spara den temporärt och se om vi hittar något bättre!
									tempCid = alias[tname][0].id;
									tempCountryname = alias[tname][0].name;
								}
							}
							if (cid) { // Vi hittade en bra tagg, kör som bvnligt!
								callback({ // Call callback method
									"artist": artist,
									"id": cid,
									"tag": tname,
									"name": countryName,
								});
								running = false; // Stop searching for country-tags
							
							}
						} catch (e) {
							//console.log(artist, tname)
						}


					}

				})

				if (running) { // Vi hittade inget perfekt land. 
					if (tempCid) { //go with backup plan, använd den problematiska taggen
						console.log("Potentially incorrect country for '" + artist + "': " + tempCountryname + ", using only the tag '" + troubleFound + "'");
							callback({ // Call callback method
								"artist": artist,
								"id": tempCid,
								"tag": tname,
								"name": tempCountryname,
							});
							running = false; // Stop searching for country-tags
					} else {
						callback({
							"artist": artist
						})
					}


				}
			});
		}

		/**
		 * Returns a list of country objects for a list of artist names.
		 *
		 * Beware!!! overwrites localstorage.artists when done!!! woaps!!!!!! dododod!!!
		 * @param  {Array}   artists  Array of artist names (String)
		 * @param  {Function} callback Callback function. Argument is a list of country objects,
		 *                             containing only those artists that have a country
		 *                             associated with them. For object structure, see api.getCountry
		 */
		api.getCountries = function(artists, callback) {
			var returnList = [],
				count = 0;
			/**
			 * Increases a count and checks if we've tried
			 * to get country for all artists
			 */
			var checkCount = function() {
				count++;
				superCount++;
				d3.select("#loading-text").html("Loading artists...<br>(" + superCount + "/" + SESSION.total_artists + ")<br>You can start exploring,<br>but it might interfere<br>with loading your artists.");
				if (count === artists.length) {
					// We done, save artists and call back
					localforage.setItem("artists", STORED_ARTISTS, function (err) {
						if (err) { console.error("Failed saving artists to storage: ", err); }
						callback(returnList);
					});
				}
			}

			// Get countries for all artists
			artists.forEach(function(el, i) {
				// first check stored artists to see if we've already checked this artist
				if (STORED_ARTISTS[el] && STORED_ARTISTS[el].country) {
					var returnObject = STORED_ARTISTS[el].country;
					returnObject.artist = el;
					returnList.push(returnObject);
					checkCount();
				} else {
					var start = new Date().getTime();

					api.getCountry(el, function(data) {
						STORED_ARTISTS[el] = STORED_ARTISTS[el] || {};
						// console.error(data)

						// if (data.name) {
						STORED_ARTISTS[el].country = {
							"id": data.id,
							"name": data.name,
						};
						returnList.push(data);
						// }
						// console.log("apicall " + (new Date().getTime() - start) + " ms");

						// Update loading div, whoah ugly code yeah whaddayagonnado


						checkCount();
					})
				}

			})
		}
	})

	/**
	 * Get all tags for an artist.
	 * @param  {String}   artist   Artist name
	 * @param  {Function} callback Callback function. Takes one argument which is an array
	 *                             of tag objects (see the last.fm api doc for tag object structure)
	 */
	api.getTags = function(artist, callback) {
		// Check if artist tags are already saved, if so return them
		if (STORED_ARTISTS[artist] && STORED_ARTISTS[artist].tags) {
			// console.log("Had in store, no api call");
			callback(STORED_ARTISTS[artist].tags);
		} else {
			// Create object in localstorage
			STORED_ARTISTS[artist] = STORED_ARTISTS[artist] || {};
			STORED_ARTISTS[artist].tags = [];

			// Get from lastfm
			api.lastfm.send("artist.gettoptags", [["artist", artist]],
				function(err, responseData2) {
					STORED_ARTISTS[artist].tags = responseData2.toptags.tag;
					localforage.setItem("artists", STORED_ARTISTS, function (err) {
						if (err) { console.error("Failed saving artists to storage: ", err); }
						callback(STORED_ARTISTS[artist].tags);
					});
				});
		}
	}

	api.getArtistInfo = function(artist, callback) {
		var artistInfo = [];

		api.lastfm.send("artist.getinfo", [["artist", artist]], function(err, data1) {
			//Creating a list of tag names
			var tagnamelist = [];
			if (data1.artist.tags.tag) {
				data1.artist.tags.tag.forEach(function(t, i) {
					tagnamelist.push(t.name);
				})
			}

			artistInfo.push({
				name: artist,
				url: data1.artist.url,
				image: data1.artist.image[3]["#text"],
				description: data1.artist.bio.summary,
				tags: tagnamelist
			})
			callback(artistInfo);
		})



	}

	/**
	 * Gets a list of artists with tags similar to the user's top tags, sorted in descending order.
	 * Also included are which tags matched.
	 *
	 * Calling this function cancels previous requests initiated by this function.
	 * @param  {String}   country  Name of country or country alias (sweden, swedish, your choice)
	 * @param  {Function} callback Callback function. Argument is a list of artists.
	 */
	var recommendationRequests = [];
	api.cancelRecommendationRequests = function () {
		recommendationRequests.forEach(function (xhr) {
			xhr.abort();
		});

		recommendationRequests = [];
	}
	api.getRecommendations = function (country, callback) {
		api.cancelRecommendationRequests();

		var recommendations = [];

		// get top tags for user
		var toptags = USER_TAGS.slice(0, 15);
		// make tag list to an object (back n forthss)
		var userTagObj = d3.nest().key(function(d) {
			return d.tag;
		}).rollup(function(d) {
			return d[0].count;
		}).map(toptags);


		//console.log("Got top tags for user!")

		// Get top artists for tag country
		var xhr1 = api.lastfm.send("tag.gettopartists", [["tag", country], ["limit", 100]], function(err, data1) {
			// Gotta count matching tags to then sort
			var tagCounts = {};

			// Get the tags for these artists
			//console.log(data1, err)
			if (err || data1.error || !data1.topartists || !data1.topartists.artist) {
				callback([]);
				return;
			}
			var artists = data1.topartists.artist;

			artists.forEach(function(a, num) {
				tagCounts[a.name] = [];
				var xhr2 = api.lastfm.send("artist.gettoptags", [["artist", a.name]], function(err, data2) {
					var hasTags = !data2.error && (data2.toptags.tag ? true : false);
					d3.select("#rec-loading-current").html("(" + a.name + ")");
					if (hasTags) {
						// Compare top 10 tags to user tags
						var tags = d3.nest().key(function(d) {
							return d.name;
						}).map(data2.toptags.tag);

						// Get rid of justin bieber
						if (tags[country]) {
							for (var i = data2.toptags.tag.length - 1; i >= 0; i--) {
								if (userTagObj[data2.toptags.tag[i].name] && data2.toptags.tag[i].count > 5) {
									tagCounts[a.name].push(data2.toptags.tag[i].name);
								}
							};
						}
					}

					if (num === artists.length - 1) {
						//console.log("We've gotten tag counts for all artists, make a list!")
						d3.keys(tagCounts).forEach(function(d) {
							recommendations.push({
								name: d,
								count: tagCounts[d].length,
								tags: tagCounts[d]
							})
						});

						recommendations.sort(function(a, b) {
							return b.count < a.count ? -1 : b.count > a.count ? 1 : 0;
						})
						//console.log(recommendations)
						callback(recommendations);
					}

				})

				recommendationRequests.push(xhr2);
			})
		})

		recommendationRequests.push(xhr1);
	}

	api.getFriends = function(callback) {
		api.lastfm.send("user.getFriends", [["user", SESSION.name]], callback);
	}
})(window, document);
