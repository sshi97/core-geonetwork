/*
 * Copyright (C) 2001-2016 Food and Agriculture Organization of the
 * United Nations (FAO-UN), United Nations World Food Programme (WFP)
 * and United Nations Environment Programme (UNEP)
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301, USA
 *
 * Contact: Jeroen Ticheler - FAO - Viale delle Terme di Caracalla 2,
 * Rome - Italy. email: geonetwork@osgeo.org
 */

(function() {
  goog.provide('gn_harvest_controller');





  goog.require('gn_harvest_report_controller');
  goog.require('gn_harvest_settings_controller');
  goog.require('gn_dashboard_wfs_indexing_controller');
  goog.require('gn_harvester');

  var module = angular.module('gn_harvest_controller',
      ['gn_harvest_settings_controller',
        'gn_dashboard_wfs_indexing_controller',
       'gn_harvest_report_controller', 'gn_harvester']);


  /**
   *
   */
  module.controller('GnHarvestController', [
    '$scope', '$http', 'gnUtilityService',
    function($scope, $http, gnUtilityService) {
      $scope.isLoadingHarvester = false;
      $scope.harvesters = null;
      $scope.pageMenu = {tabs: {}};

      $scope.pageMenu.tabs =
            [{
              type: 'harvest-settings',
              label: 'harvesterSetting',
              icon: 'fa-cloud-download',
              href: '#/harvest/harvest-settings'
            },{
              type: 'harvest-report',
              label: 'harvesterReport',
              icon: 'fa-th',
              href: '#/harvest/harvest-report'
            }];

      function loadConditionalTabs() {
        if ($scope.healthCheck.IndexHealthCheck === true) {
          $scope.pageMenu.tabs = $scope.pageMenu.tabs.concat({
            type: 'wfs-indexing',
            label: 'wfs-indexing',
            icon: 'fa-map-marker',
            href: '#/harvest/wfs-indexing'
          });
        }
      }

      loadConditionalTabs();

      $scope.$watch('healthCheck.IndexHealthCheck', function (n, o) {
        if (n !== o) {
          loadConditionalTabs();
        }
      });

      $scope.pageMenu = {
        folder: 'harvest/',
        defaultTab: 'harvest-settings',
        tabs: $scope.pageMenu.tabs
      };

      $scope.loadHarvesters = function() {
        $scope.isLoadingHarvester = true;
        $scope.harvesters = null;
        return $http.get('admin.harvester.list?_content_type=json').
            success(
            function(data) {
              if (data != 'null') {
                $scope.harvesters = data;
                gnUtilityService.parseBoolean($scope.harvesters);
                pollHarvesterStatus();
              }
              $scope.isLoadingHarvester = false;
            }).error(function(data) {
              // TODO
              $scope.isLoadingHarvester = false;
            });
      };

      var getRunningHarvesterIds = function() {
        var runningHarvesters = [];
        for (var i = 0; $scope.harvesters &&
            i < $scope.harvesters.length; i++) {
          var h = $scope.harvesters[i];
          if (h.info.running && h["@type"] != 'csw2') {
            runningHarvesters.push(h['@id']);
          }
        }

        return runningHarvesters;
      };

      var getRunningRemoteHarvesterIds = function() {

        var runningHarvestersReady = [];
        var existRunningHarvestersNotReady = false;

        for (var i = 0; $scope.harvesters &&
        i < $scope.harvesters.length; i++) {
          var h = $scope.harvesters[i];
          if (h.info.running && h["@type"] == 'csw2') {
            if (h.info.result != undefined) {
              runningHarvestersReady.push(h.info.result.processID);
            } else {
              existRunningHarvestersNotReady = true;
            }
          }
        }

        var runningHarvesters = {
          existRunningHarvestersNotReady: existRunningHarvestersNotReady,
          runningHarvesters: runningHarvestersReady
        };

        return runningHarvesters;
      };

      var isPolling = false;
      var pollHarvesterStatus = function() {
        if (isPolling) {
          return;
        }
        var runningHarvesters = getRunningHarvesterIds();
        var runningRemoteHarvestersInfo = getRunningRemoteHarvesterIds();
        var runningRemoteHarvesters = runningRemoteHarvestersInfo.runningHarvesters;
        var existRunningHarvestersNotReady = runningRemoteHarvestersInfo.existRunningHarvestersNotReady;

        if ((runningHarvesters.length == 0) && (runningRemoteHarvesters.length == 0) && !existRunningHarvestersNotReady) {
          return;
        }

        if ((runningHarvesters.length == 0) && (runningRemoteHarvesters.length == 0) && existRunningHarvestersNotReady) {
          setTimeout(pollHarvesterStatus, 10000);
          return;
        }

        isPolling = true;

        if (runningHarvesters.length > 0) {
          $http.get('admin.harvester.list?onlyInfo=true&_content_type=json&id=' +
            runningHarvesters.join('&id=')).success(
            function(data) {
              isPolling = false;
              if (data != 'null') {
                if (!angular.isArray(data)) {
                  data = [data];
                }
                var harvesterIndex = {};
                angular.forEach($scope.harvesters, function(oldH) {
                  harvesterIndex[oldH['@id']] = oldH;
                });

                for (var i = 0; i < data.length; i++) {
                  var h = data[i];
                  gnUtilityService.parseBoolean(h.info);
                  var old = harvesterIndex[h['@id']];
                  if (old && !angular.equals(old.info, h.info)) {
                    old.info = h.info;
                  }
                  if (old && !angular.equals(old.error, h.error)) {
                    old.error = h.error;
                  }
                }

                setTimeout(pollHarvesterStatus, 10000);
              }
            }).error(function(data) {
            isPolling = false;
          });
        }

        if (runningRemoteHarvesters.length > 0) {
          $http.get('../api/remoteharvesters/progress?id=' +
            runningRemoteHarvesters.join('&id=')).success(
            function(data) {
              console.log(data);

              isPolling = false;
              if (data != 'null') {
                if (!angular.isArray(data)) {
                  data = [data];
                }

                angular.forEach($scope.harvesters, function(oldH) {
                  for (var i = 0; i < data.length; i++) {
                    var h = data[i];

                    if ((oldH.info.result) && (oldH.info.result.processID == h.processID)) {
                      oldH.info.result.running = h.running;
                      oldH.info.result.runningHarvest = h.runningHarvest;
                      oldH.info.result.runningLinkChecker = h.runningLinkChecker;
                      oldH.info.result.runningIngest = h.runningIngest;
                      oldH.info.result.harvesterStatus  = h.harvesterStatus;
                    }
                  }

                });

                /*var harvesterIndex = {};
                angular.forEach($scope.harvesters, function(oldH) {
                  harvesterIndex[oldH['@id']] = oldH;
                });

                for (var i = 0; i < data.length; i++) {
                  var h = data[i];
                  gnUtilityService.parseBoolean(h);

                  var k = Object.keys(harvesterIndex);

                  for (var j = 0; j < k.length; k++) {
                    var old = harvesterIndex[k[j]];

                    if ((old.info.result) && (old.info.result.processID == h.processID)) {
                      old.info.status = h;
                    }
                  }
                }*/

                setTimeout(pollHarvesterStatus, 10000);
              }
            }).error(function(data) {
            isPolling = false;
          });
        }
      };

      $scope.refreshHarvester = function() {
        $scope.loadHarvesters().then(function() {
          if ($scope.harvesterSelected) {
            // Select the clone
            angular.forEach($scope.harvesters, function(h) {
              if (h['@id'] === $scope.harvesterSelected['@id']) {
                $scope.selectHarvester(h);
              }
            });
          }
        });
      };

      $scope.loadHarvesters();
    }]);
})();
