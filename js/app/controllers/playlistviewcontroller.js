
/**
 * ownCloud - Music app
 *
 * @author Morris Jobke
 * @copyright 2013 Morris Jobke <morris.jobke@gmail.com>
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU AFFERO GENERAL PUBLIC LICENSE
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU AFFERO GENERAL PUBLIC LICENSE for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with this library.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


angular.module('Music').controller('PlaylistViewController',
	['$rootScope', '$scope', '$routeParams', 'playlistService', 'gettextCatalog', 'Restangular', '$timeout',
	function ($rootScope, $scope, $routeParams, playlistService, gettextCatalog, Restangular , $timeout) {

		var INCREMENTAL_LOAD_STEP = 1000;
		$scope.incrementalLoadLimit = INCREMENTAL_LOAD_STEP;
		$scope.tracks = null;
		$rootScope.currentView = window.location.hash;

		// $rootScope listeneres must be unsubscribed manually when the control is destroyed
		var unsubFuncs = [];

		function subscribe(event, handler) {
			unsubFuncs.push( $rootScope.$on(event, handler) );
		}

		$scope.$on('$destroy', function () {
			_.each(unsubFuncs, function(func) { func(); });
		});

		$scope.getCurrentTrackIndex = function() {
			return listIsPlaying() ? $scope.$parent.currentTrackIndex : null;
		};

		// Remove chosen track from the list
		$scope.removeTrack = function(trackIndex) {
			// Remove the element first from our internal array, without recreating the whole array.
			// Doing this before the HTTP request improves the perceived performance.
			$scope.tracks.splice(trackIndex, 1);

			if (listIsPlaying()) {
				var playingIndex = $scope.getCurrentTrackIndex();
				if (trackIndex <= playingIndex) {
					--playingIndex;
				}
				playlistService.onPlaylistModified($scope.tracks, playingIndex);
			}

			$scope.playlist.all("remove").post({indices: trackIndex}).then(function(updatedList) {
				$scope.$parent.updatePlaylist(updatedList);
			});
		};

		// Call playlistService to play all songs in the current playlist from the beginning
		$scope.playAll = function() {
			playlistService.setPlaylist($scope.tracks);
			playlistService.publish('play');
		};

		// Play the list, starting from a specific track
		$scope.playTrack = function(trackIndex) {
			playlistService.setPlaylist($scope.tracks, trackIndex);
			playlistService.publish('play');
		};

		$scope.getDraggable = function(index) {
			$scope.draggedIndex = index;
			return {
				track: $scope.tracks[index].track,
				srcIndex: index
			};
		};

		$scope.reorderDrop = function(draggable, dstIndex) {
			moveArrayElement($scope.tracks, draggable.srcIndex, dstIndex);

			if (listIsPlaying()) {
				var playingIndex = $scope.getCurrentTrackIndex();
				if (playingIndex === draggable.srcIndex) {
					playingIndex = dstIndex;
				}
				else {
					if (playingIndex > draggable.srcIndex) {
						--playingIndex;
					}
					if (playingIndex >= dstIndex) {
						++playingIndex;
					}
				}
				playlistService.onPlaylistModified($scope.tracks, playingIndex);
			}

			$scope.playlist.all("reorder").post({fromIndex: draggable.srcIndex, toIndex: dstIndex}).then(
				function(updatedList) {
					$scope.$parent.updatePlaylist(updatedList);
				}
			);
		};

		$scope.allowDrop = function(draggable, dstIndex) {
			return $scope.playlist && draggable.srcIndex != dstIndex;
		};

		$scope.updateHoverStyle = function(dstIndex) {
			var element = $('.playlist-area .track-list');
			if ($scope.draggedIndex > dstIndex) {
				element.removeClass('insert-below');
				element.addClass('insert-above');
			} else if ($scope.draggedIndex < dstIndex) {
				element.removeClass('insert-above');
				element.addClass('insert-below');
			} else {
				element.removeClass('insert-above');
				element.removeClass('insert-below');
			}
		};

		subscribe('scrollToTrack', function(event, trackId) {
			if ($scope.$parent) {
				$scope.$parent.scrollToItem('track-' + trackId);
			}
		});

		// Init happens either immediately (after making the loading animation visible)
		// or once both aritsts and playlists have been loaded
		$timeout(function() {
			initViewFromRoute();
		});
		subscribe('artistsLoaded', function () {
			initViewFromRoute();
		});
		subscribe('playlistsLoaded', function () {
			initViewFromRoute();
		});

		function listIsPlaying() {
			return ($rootScope.playingView === $rootScope.currentView);
		}

		function showMore() {
			// show more entries only if the view is not already (being) deactivated
			if ($rootScope.currentView && $scope.$parent) {
				$scope.incrementalLoadLimit += INCREMENTAL_LOAD_STEP;
				if ($scope.incrementalLoadLimit < $scope.tracks.length) {
					$timeout(showMore);
				} else {
					$rootScope.loading = false;
				}
			}
		}

		function initViewFromRoute() {
			if ($scope.$parent && $scope.$parent.artists && $scope.$parent.playlists) {
				if ($routeParams.playlistId) {
					var playlist = findPlaylist($routeParams.playlistId);
					$scope.playlist = playlist;
					$scope.tracks = createTracksArray(playlist.trackIds);
				}
				else {
					$scope.playlist = null;
					$scope.tracks = createAllTracksArray();
				}
				$timeout(showMore);
			}
		}

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

		function moveArrayElement(array, from, to) {
			array.splice(to, 0, array.splice(from, 1)[0]);
		}

		function findPlaylist(id) {
			return _.findWhere($scope.$parent.playlists, { id: Number(id) });
		}

		function createTracksArray(trackIds) {
			return _.map(trackIds, function(trackId) {
				return { track: $scope.$parent.allTracks[trackId] };
			});
		}

		function createAllTracksArray() {
			var tracks = null;
			if ($scope.$parent.allTracks) {
				tracks = _.map($scope.$parent.allTracks, function(track) {
					return { track: track };
				});

				tracks = _.sortBy(tracks, function(t) { return t.track.title.toLowerCase(); });
				tracks = _.sortBy(tracks, function(t) { return t.track.artistName.toLowerCase(); });
			}
			return tracks;
		}

}]);
