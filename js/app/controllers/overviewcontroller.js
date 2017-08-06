/**
 * ownCloud - Music app
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Morris Jobke <hey@morrisjobke.de>
 * @copyright Morris Jobke  2014
 */

angular.module('Music').controller('OverviewController',
	['$scope', '$rootScope', 'playlistService', 'Restangular', '$route', '$window', '$timeout',
	function ($scope, $rootScope, playlistService, Restangular, $route, $window, $timeout) {

		$rootScope.currentView = '#';

		var INCREMENTAL_LOAD_STEP = 4;
		$scope.incrementalLoadLimit = INCREMENTAL_LOAD_STEP;

		// $rootScope listeneres must be unsubscribed manually when the control is destroyed
		var unsubFuncs = [];

		function subscribe(event, handler) {
			unsubFuncs.push( $rootScope.$on(event, handler) );
		}

		$scope.$on('$destroy', function () {
			_.each(unsubFuncs, function(func) { func(); });
		});

		// Prevent controller reload when the URL is updated with window.location.hash,
		// unless the new location actually requires another controller.
		// See http://stackoverflow.com/a/12429133/2104976
		var lastRoute = $route.current;
		$scope.$on('$locationChangeSuccess', function(event) {
			if (lastRoute.$$route.controller === $route.current.$$route.controller) {
				$route.current = lastRoute;
			}
		});

		// Wrap the supplied tracks as a playlist and pass it to the service for playing
		function playTracks(tracks, startIndex /*optional*/) {
			var playlist = _.map(tracks, function(track) {
				return { track: track };
			});
			playlistService.setPlaylist(playlist, startIndex);
			playlistService.publish('play');
		}

		$scope.playTrack = function(track) {
			// update URL hash
			window.location.hash = '#/track/' + track.id;

			var album = $scope.$parent.findAlbumOfTrack(track.id);
			playTracks(album.tracks, album.tracks.indexOf(track));
		};

		$scope.playAlbum = function(album) {
			// update URL hash
			window.location.hash = '#/album/' + album.id;
			playTracks(album.tracks);
		};

		$scope.playArtist = function(artist) {
			// update URL hash
			window.location.hash = '#/artist/' + artist.id;
			playTracks(_.flatten(_.pluck(artist.albums, 'tracks')));
		};

		$scope.playFile = function (fileid) {
			if (fileid) {
				Restangular.one('file', fileid).get()
					.then(function(result){
						playTracks([result]);
						scrollToAlbumOfTrack(result.id);
					});
			}
		};

		$scope.getDraggable = function(type, draggedElement) {
			var draggable = {};
			draggable[type] = draggedElement;
			return draggable;
		};

		// emited on end of playlist by playerController
		subscribe('playlistEnded', function() {
			window.location.hash = '#/';
		});

		subscribe('scrollToTrack', function(event, trackId) {
			var track = findTrack(trackId);
			if (track) {
				scrollToAlbumOfTrack(trackId);
			}
		});

		function scrollToAlbumOfTrack(trackId) {
			var album = $scope.$parent.findAlbumOfTrack(trackId);
			if (album) {
				$scope.$parent.scrollToItem('album-' + album.id);
			}
		}

		function findArtist(id) {
			return _.findWhere($scope.$parent.artists, { id: Number(id) });
		}

		function findAlbum(id) {
			return _.findWhere($scope.$parent.albums, { id: Number(id) });
		}

		function findTrack(id) {
			return $scope.$parent.allTracks[id];
		}

		function isPlaying() {
			return $rootScope.playingView !== null;
		}

		function initializePlayerStateFromURL() {
			var hashParts = window.location.hash.substr(1).split('/');
			if (!hashParts[0] && hashParts[1] && hashParts[2]) {
				var type = hashParts[1];
				var id = hashParts[2];

				if (type == 'file') {
					$scope.playFile(id);
				} else if (type == 'artist') {
					$scope.playArtist(findArtist(id));
					$scope.$parent.scrollToItem('artist-' + id);
				} else if (type == 'album') {
					$scope.playAlbum(findAlbum(id));
					$scope.$parent.scrollToItem('album-' + id);
				} else if (type == 'track') {
					var track = findTrack(id);
					$scope.playTrack(track);
					scrollToAlbumOfTrack(id);
				}
			}
			$rootScope.loading = false;
		}

		function showMore() {
			// show more entries only if the view is not already (being) deactivated
			if ($rootScope.currentView && $scope.$parent) {
				$scope.incrementalLoadLimit += INCREMENTAL_LOAD_STEP;
				if ($scope.incrementalLoadLimit < $scope.$parent.artists.length) {
					$timeout(showMore);
				} else {
					// Do not reinitialize the player state if it is already playing.
					// This is the case when the user has started playing music while scanning is ongoing,
					// and then hits the 'update' button. Reinitializing would stop and restart the playback.
					if (!isPlaying()) {
						initializePlayerStateFromURL();
					} else {
						$rootScope.loading = false;
					}
				}
			}
		}

		// initialize either immedately or once the parent view has finished loading the collection
		if ($scope.$parent.artists) {
			$timeout(showMore);
		}

		subscribe('artistsLoaded', function() {
			showMore();
		});

		function showLess() {
			$scope.incrementalLoadLimit -= INCREMENTAL_LOAD_STEP;
			if ($scope.incrementalLoadLimit > 0) {
				$timeout(showLess);
			} else {
				$scope.incrementalLoadLimit = 0;
				$rootScope.$emit('viewDeactivated');
			}
		}

		subscribe('deactivateView', function() {
			$timeout(showLess);
		});
}]);
