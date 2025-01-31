(function () {
    'use strict';

    var controllerId = 'mainController';

    function mainController($filter, $mdDialog, $mdSidenav, $location, $rootScope, $scope, $window, common, config,
                            conformanceService, fhirServers, terminologyServers, auth, store, jwtHelper, smartAuthorizationService) {
        /*jshint validthis:true */
        var vm = this;

        var logError = common.logger.getLogFn(controllerId, 'error');
        var logInfo = common.logger.getLogFn(controllerId, 'info');
        var logWarning = common.logger.getLogFn(controllerId, 'warning');
        var logDebug = common.logger.getLogFn(controllerId, 'debug');

        var _adminPages = [
            {name: 'Encounter', href: 'encounter/view/current'},
            {name: 'Organization', href: 'organization/view/current'},
            {name: 'Patient', href: 'patient/view/current'},
            {name: 'Person', href: 'person/view/current'},
            {name: 'Practitioner', href: 'practitioner/view/current'},
            {name: 'Related Person', href: 'relatedPerson/view/current'}
        ];
        var _conformancePages = [
            {name: 'Conformance Statement', href: 'conformance/view/current'},
            {name: 'Extension Definition', href: 'extensionDefinition'},
            {name: 'Operation Definition', href: 'operationDefinition'},
            {name: 'Structure Definition', href: 'structureDefinition'},
            {name: 'Value Set', href: 'valueSet'}
        ];
        var _documentsPages = [
            {name: 'Composition', href: 'composition'},
            {name: 'Document Manifest', href: 'documentManifest'},
            {name: 'Document Reference', href: 'documentReference'}
        ];
        var _clinicalPages = [
            {name: 'Allergy', href: 'allergy'},
            {name: 'Condition', href: 'condition'},
            {name: 'Diagnostic Order', href: 'diagnosticOrder'},
            {name: 'Diagnostic Report', href: 'diagnosticReport'},
            {name: 'Family History', href: 'familyHistory'},
            {name: 'Immunization', href: 'immunization'},
            {name: 'Medication', href: 'medication'},
            {name: 'Medication Statement', href: 'medicationStatement'}
        ];
        var _dafResources = [
            {name: 'Patient', href: 'daf/patient'},
            {name: 'Allergy Intolerance', href: 'daf/allergyIntolerance'},
            {name: 'Diagnostic Order', href: 'daf/organization'},
            {name: 'Diagnostic Report', href: 'daf/diagnosticReport'},
            {name: 'Encounter', href: 'daf/encounter'},
            {name: 'Family History', href: 'daf/familyHistory'},
            {name: 'Immunization', href: 'daf/immunization'},
            {name: 'Results', href: 'daf/results'},
            {name: 'Medication', href: 'daf/medication'},
            {name: 'Medication Statement', href: 'daf/medicationStatement'},
            {name: 'Medication Administration', href: 'daf/medicationAdministration'},
            {name: 'Condition', href: 'daf/condition'},
            {name: 'Procedure', href: 'daf/procedure'},
            {name: 'Smoking Status', href: 'daf/smokingStatus'},
            {name: 'Vital Signs', href: 'daf/vitalSigns'},
            {name: 'List', href: 'daf/list'}
        ];
        var _sections = [
            {name: 'Administration', id: 1, pages: _adminPages},
            //       {name: 'Clinical', id: 2, pages: _clinicalPages},
            {name: 'Conformance', id: 3, pages: _conformancePages},
            //        {name: 'Documents', id: 4, pages: _documentsPages},
            //{name: 'DAF Profiles', id: 5, pages: _dafResources}
        ];
        var noToast = false;

        function _activate() {
            common.activateController([_getActiveServers()], controllerId)
                .then(function () {
                    //for processing SMART authorization
                    if (vm.activeServer.mode === 'authCode') {
                        _processAuthorizationResponse();
                    } else if (vm.activeServer.mode === 'implicit') {
                        _processImplicitResponse();
                    }
                }, function (error) {
                    logError('Error ' + error);
                });
        }

        function _processImplicitResponse() {
            var response = $location.hash();
            if (angular.isUndefined(response) === false) {
                var args = response.split('&');
                for (var i = 0, len = args.length; i < len; i++) {
                    var arg = args[i];
                    var parsedArg = arg.split('=');
                    switch (parsedArg[0]) {
                        case "state":
                            var state = parsedArg[1];
                            //TODO: compare state
                            break;
                        case "session_state":
                            store.set('token.session', parsedArg[1]);
                            break;
                        case "expires_in":
                            store.set('token.expires', parsedArg[1]);
                            break;
                        case "access_token":
                            store.set('authToken', parsedArg[1]);
                            store.set('profile', jwt_decode(parsedArg[1]));
                            break;
                        default:
                            logWarning("Unexpected argument " + parsedArg[0] + "=" + parsedArg[1], args, noToast);
                    }
                }
            }
        }

        function _processAuthorizationResponse() {
            var authorizeResponse = $location.search();
            if (angular.isUndefined(authorizeResponse.code) === false) {
                var code = authorizeResponse.code;
                var state = authorizeResponse.state;
                if (code && state) {
                    _getAccessToken(code, state);
                }
            }
        }

        function _getActiveServers() {
            fhirServers.getActiveServer()
                .then(function (server) {
                    vm.activeServer = server;
                });
            terminologyServers.getActiveServer()
                .then(function (server) {
                    vm.terminologyServer = server;
                });
        }

        function toggleMenu() {
            $mdSidenav('left').toggle();
        }

        function chooseTerminology(ev) {
            $mdDialog.show({
                controller: terminologyController,
                templateUrl: 'templates/server-dialog.html',
                targetEvent: ev,
                clickOutsideToClose: false
            });
        }

        vm.chooseTerminology = chooseTerminology;

        function terminologyController($scope, $mdDialog, terminologyServers) {
            function _setActiveServer(fhirServer) {
                conformanceService.getConformanceMetadata(fhirServer.baseUrl)
                    .then(function (conformance) {
                        logDebug('Retrieved conformance statement for ' + fhirServer.name, null, noToast);
                        vm.terminologyServer = fhirServer;
                        terminologyServers.setActiveServer(vm.terminologyServer);
                        if (angular.isDefined(vm.terminologyServer.clientId)) {
                            authorize();
                        } else {
                            store.remove('authToken');
                        }
                    }, function (error) {
                        logError('Error returning conformance statement for terminology server ' + fhirServer.name + '. Server ' + vm.terminologyServer.name + ' abides.', error);
                    });
                logDebug('Requesting access to terminology server ' + fhirServer.name + ' ...');
            }

            function change() {
                $mdDialog.hide();
                if (common.isUndefinedOrNull(vm.terminologyServer) ||
                    $scope.selectedServer.id !== vm.terminologyServer.id) {
                    _setActiveServer($scope.selectedServer);
                }
            }

            $scope.change = change;

            function close() {
                $mdDialog.hide();
            }

            $scope.close = close;

            function serverChanged(server) {
                _.each($scope.FHIRServers, function (item) {
                    if (server.id !== item.id) {
                        item.selected = false;
                    }
                });
                $scope.selectedServer = server;
            }

            $scope.serverChanged = serverChanged;

            terminologyServers.getAllServers().then(function (data) {
                _.each(data, function (item) {
                    if (common.isUndefinedOrNull(vm.terminologyServer) === false && vm.terminologyServer.id === item.id) {
                        item.selected = true;
                    }
                });
                $scope.FHIRServers = data;
            });
            $scope.server = store.get('terminologyServer');
            $scope.selectedServer = vm.terminologyServer;
            $scope.title = "Choose a Terminology Server";
        }

        function chooseFHIRServer(ev) {
            $mdDialog.show({
                controller: fhirServerController,
                templateUrl: 'templates/server-dialog.html',
                targetEvent: ev,
                clickOutsideToClose: false
            });
        }

        vm.chooseFHIRServer = chooseFHIRServer;

        function fhirServerController($scope, $mdDialog, fhirServers) {
            function change() {
                $mdDialog.hide();
                if (common.isUndefinedOrNull(vm.activeServer) ||
                    $scope.selectedServer.id !== vm.activeServer.id) {
                    _updateActiveServer($scope.selectedServer);
                }
            }

            $scope.change = change;

            function close() {
                $mdDialog.hide();
            }

            $scope.close = close;

            function _updateActiveServer(fhirServer) {
                conformanceService.clearCache();
                conformanceService.getConformanceMetadata(fhirServer.metadataUrl ? fhirServer.metadataUrl : fhirServer.baseUrl)
                    .then(function (conformance) {
                        logDebug('Retrieved conformance statement for ' + fhirServer.name, null, noToast);
                        vm.activeServer = fhirServer;
                        if (angular.isUndefined(conformance.rest[0].security)) {
                            logWarning("Security information missing - this is an OPEN server.", null, noToast);
                        } else if (angular.isArray(conformance.rest[0].security.extension[0].extension)) {
                            _.forEach(conformance.rest[0].security.extension[0].extension, function (ex) {
                                if (_.endsWith(ex.url, "authorize")) {
                                    vm.activeServer.authorizeUri = ex.valueUri;
                                    logInfo("Authorize URI found: " + vm.activeServer.authorizeUri, null, noToast);
                                }
                                if (_.endsWith(ex.url, "token")) {
                                    vm.activeServer.tokenUri = ex.valueUri;
                                    logInfo("Token URI found: " + vm.activeServer.tokenUri, null, noToast);
                                }
                            })
                        }
                        var url = $location.protocol() + "://" + $location.host();
                        if ($location.port() !== 80 && $location.port() !== 443) {
                            url = url + ":" + $location.port();
                        }
                        vm.activeServer.redirectUri = url;
                        fhirServers.setActiveServer(vm.activeServer);
                        common.changeServer(vm.activeServer);
                        if (angular.isUndefined(vm.activeServer.clientId) === false) {
                            authorize();
                        } else {
                            store.remove('authToken');
                        }
                    }, function (error) {
                        logError('Error returning conformance statement for ' + fhirServer.name + '. Server ' + vm.activeServer.name + ' abides.', error);
                    });
                logDebug('Requesting access to server ' + fhirServer.name + ' ...');
            }

            function serverChanged(server) {
                _.each($scope.FHIRServers, function (item) {
                    if (server.id !== item.id) {
                        item.selected = false;
                    }
                });
                $scope.selectedServer = server;
            }

            $scope.serverChanged = serverChanged;

            fhirServers.getAllServers().then(function (data) {
                _.each(data, function (item) {
                    if (common.isUndefinedOrNull(vm.activeServer) === false && vm.activeServer.id === item.id) {
                        item.selected = true;
                    }
                });
                $scope.FHIRServers = data;
            });
            $scope.server = store.get('terminologyServer');
            $scope.selectedServer = vm.activeServer;
            $scope.title = "Choose a FHIR Server";
        }

        function showAbout(ev) {
            $mdDialog.show({
                controller: aboutController,
                templateUrl: 'templates/about.html',
                targetEvent: ev,
                clickOutsideToClose: true
            });
        }

        vm.showAbout = showAbout;

        function aboutController($scope, $mdDialog) {
            function close() {
                $mdDialog.hide();
            }

            $scope.close = close;
            $scope.activeServer = vm.activeServer;
            $scope.terminologyServer = store.get('terminologyServer');
            $scope.patient = store.get('patient');
            if (common.isUndefinedOrNull($scope.patient) === false) {
                $scope.patient.fullName = $filter('fullName')($scope.patient.name);
            }
        }

        function authenticate(ev) {
            $mdDialog.show({
                controller: authenticateController,
                templateUrl: './templates/authenticate.html',
                targetEvent: ev,
                clickOutsideToClose: true
            });
        }

        vm.authenticate = authenticate;

        function login() {
            auth.signin({}, function (profile, token) {
                store.set('profile', profile);
                store.set('token', token);
                $location.path('/');
                common.changeUser(profile);
            }, function () {
                // Error callback
            });
        }

        vm.login = login;

        function logout() {
            auth.signout();
            store.remove('profile');
            store.remove('token');
            store.remove('authToken');
            store.remove('smartResponse');
            common.changeUser(null);
            $location.path('/');
        }

        vm.logout = logout;

        function authorize() {
            logDebug("Initiating authorization ...", null, noToast);
            if (angular.isUndefined(vm.activeServer.authorizeUri) || angular.isUndefined(vm.activeServer.tokenUri)) {
                logWarning("Selected server does NOT support OAuth");
            } else {
                if (vm.activeServer.mode === 'authCode') {
                    smartAuthorizationService.authorize(vm.activeServer.clientId, vm.activeServer.authorizeUri,
                        vm.activeServer.redirectUri, vm.activeServer.baseUrl);
                } else if (vm.activeServer.mode === 'implicit') {
                    smartAuthorizationService.implicit(vm.activeServer.clientId, vm.activeServer.authorizeUri,
                        vm.activeServer.redirectUri, vm.activeServer.baseUrl, vm.activeServer.resourceId);

                } else {
                    logError("OAuth authorization flow is not specified.")
                }
            }
        }

        vm.authorize = authorize;

        function _getAccessToken(code, state) {
            smartAuthorizationService.getToken(code, state, vm.activeServer.clientId, vm.activeServer.tokenUri, vm.activeServer.redirectUri)
                .then(function (idToken) {
                    logInfo("Access token acquired from " + vm.activeServer.name);
                    if (angular.isDefined(idToken.sub)) {
                        idToken.name = idToken.sub;
                    } else {
                        idToken.name = "No Profile";
                    }
                    store.set('profile', idToken);
                    common.changeUser(idToken);
                },
                function (error) {
                    logError(error);
                }
            );
        }

        function authenticateController($scope, $mdDialog) {
            function close() {
                $mdDialog.hide();
            }

            $scope.close = close;

            function authenticate() {
                if (angular.isDefined($scope.user)) {
                    $window.localStorage.user = JSON.stringify($scope.user);
                    common.changeUser($scope.user);
                }
                $mdDialog.hide();
            }

            $scope.authenticate = authenticate;
            if (angular.isDefined($window.localStorage.user)) {
                $scope.user = JSON.parse($window.localStorage.user);
            } else {
                $scope.user = null;
            }

            $scope.activeServer = vm.activeServer;
        }

        $scope.$on(config.events.authenticatedUserChanged,
            function (event, user) {
                if (user === null && vm.user !== null) {
                    logDebug(vm.user.name + " has been logged out");
                }
                vm.user = user;
            }
        );

        $rootScope.$on('$locationChangeStart', function () {
            if (common.isAuthenticated() === false && $location.path().indexOf('home') === -1) {
                if ($location.path() !== "/") {
                    logWarning("You must authenticate to access the application");
                }
                $location.path('/home');
            }
            else if (!auth.isAuthenticated) {
                var token = store.get('token');
                vm.user = store.get('profile');
                if (token) {
                    if (!jwtHelper.isTokenExpired(token)) {
                        auth.authenticate(vm.user, token);
                    } else {
                        // Either show Login page or use the refresh token to get a new idToken
                        logWarning("Authorization token has expired");
                        $location.path('/');
                    }
                }
            }
        });

        function isSectionSelected(section) {
            return section === vm.menu.selectedSection;
        }

        function pageSelected(page) {
            vm.menu.selectedPage = page.name;
            $location.path('/' + page.href);
        }

        function toggleSelectSection(section) {
            if (angular.isDefined(vm.menu.selectedSection) && (vm.menu.selectedSection.id === section.id)) {
                vm.menu.selectedSection = undefined;

            } else {
                vm.menu.selectedSection = section;
            }
            vm.menu.selectedPage = undefined;
            vm.menu.selectedSubPage = undefined;
        }

        vm.toggleSelectSection = toggleSelectSection;

        vm.FHIRServers = [];
        vm.isSectionSelected = isSectionSelected;
        vm.menu = {
            sections: _sections,
            selectedSection: undefined,
            selectedPage: undefined,
            selectedSubPage: undefined
        };
        vm.pageSelected = pageSelected;
        vm.toggleMenu = toggleMenu;
        vm.activeServer = {id: -1};
        vm.terminologyServer = {id: -1};

        _activate();
    }

    angular.module('FHIRCloud').controller(controllerId,
        ['$filter', '$mdDialog', '$mdSidenav', '$location', '$rootScope', '$scope', '$window', 'common', 'config',
            'conformanceService', 'fhirServers', 'terminologyServers', 'auth', 'store', 'jwtHelper', 'smartAuthorizationService', mainController]);
})
();
