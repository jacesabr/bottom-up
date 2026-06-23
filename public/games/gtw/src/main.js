/**
 * Global Thermonuclear War - Main Entry Point
 * "Shall we play a game?"
 */

// Import state management systems and UI components
// This will work in both browser (via script tags) and Node (via require)

// Prevent redeclaration errors by checking if already loaded
if (typeof window !== 'undefined' && window.GTWLoaded) {
    console.log('GTW already loaded, skipping initialization');
} else {

// Initialize module references
function initializeModules() {
    if (typeof window !== 'undefined' && window.GameState) {
        // Browser environment - classes are already available as globals
        // No assignment needed since they're already on window object
    } else if (typeof require !== 'undefined') {
        // Node/testing environment - require modules and assign to global scope
        global.GameState = require('./gamestate.js').GameState;
        global.ScreenManager = require('./screenmanager.js').ScreenManager;
        global.StartScreen = require('./startscreen.js').StartScreen;
        global.FactionSelection = require('./factionselection.js').FactionSelection;
        global.WorldMap = require('./worldmap.js').WorldMap;
        global.StatusPanel = require('./statuspanel.js').StatusPanel;
        global.EventLog = require('./eventlog.js').EventLog;
        global.DefconSystem = require('./defconsystem.js').DefconSystem;
        global.CasualtySystem = require('./casualtysystem.js').CasualtySystem;
        global.FactionAssets = require('./factionassets.js').FactionAssets;
        global.TargetManager = require('./targetmanager.js').TargetManager;
        global.MissileSystem = require('./missilesystem.js').MissileSystem;
        global.MissileVisualization = require('./missilevisualization.js').MissileVisualization;
        global.ImpactSystem = require('./impactsystem.js').ImpactSystem;
        global.AIOpponent = require('./aiopponent.js').AIOpponent;
        global.EndgameDetector = require('./endgame.js').EndgameDetector;
        global.DrawScreen = require('./drawscreen.js').DrawScreen;
        global.WOPRSimulation = require('./woprsimulation.js').WOPRSimulation;
        global.WOPRVisualization = require('./woprvisualization.js').WOPRVisualization;
        global.FinalMessage = require('./finalmessage.js').FinalMessage;
        global.GameReset = require('./gamereset.js').GameReset;
        global.PerformanceMonitor = require('./performancemonitor.js').PerformanceMonitor;
    }
}

// Initialize modules immediately
initializeModules();

// Game application main class
class GTWApp {
    constructor() {
        this.initialized = false;
        this.version = '1.0.0';
        
        // Initialize state management using global classes
        this.gameState = new (window.GameState || global.GameState)();
        this.screenManager = new (window.ScreenManager || global.ScreenManager)();
        
        // Initialize UI components
        this.startScreen = new (window.StartScreen || global.StartScreen)();
        this.factionSelection = new (window.FactionSelection || global.FactionSelection)();
        this.worldMap = new (window.WorldMap || global.WorldMap)();
        this.statusPanel = new (window.StatusPanel || global.StatusPanel)();
        this.eventLog = new (window.EventLog || global.EventLog)();
        
        // Initialize game systems
        this.defconSystem = new (window.DefconSystem || global.DefconSystem)();
        this.casualtySystem = new (window.CasualtySystem || global.CasualtySystem)();
        this.factionAssets = new (window.FactionAssets || global.FactionAssets)();
        this.targetManager = new (window.TargetManager || global.TargetManager)();
        this.missileSystem = new (window.MissileSystem || global.MissileSystem)();
        this.missileVisualization = new (window.MissileVisualization || global.MissileVisualization)();
        this.impactSystem = new (window.ImpactSystem || global.ImpactSystem)();
        this.aiOpponent = new (window.AIOpponent || global.AIOpponent)();
        this.endgameDetector = new (window.EndgameDetector || global.EndgameDetector)();
        this.drawScreen = new (window.DrawScreen || global.DrawScreen)();
        this.woprSimulation = new (window.WOPRSimulation || global.WOPRSimulation)();
        this.woprVisualization = new (window.WOPRVisualization || global.WOPRVisualization)();
        this.finalMessage = new (window.FinalMessage || global.FinalMessage)();
        this.gameReset = new (window.GameReset || global.GameReset)();
        
        // Sprint 14: Performance monitoring and optimization
        this.performanceMonitor = new (window.PerformanceMonitor || global.PerformanceMonitor)();
        
        // Sprint 14: Accessibility and mobile optimizations
        this.accessibilityEnabled = true;
        this.mobileOptimizations = true;
        this.reducedMotion = false;
        
        // Connect state changes to screen changes
        this.gameState.onStateChange((event) => {
            this.handleStateChange(event);
        });
        
        // Connect start screen to state management
        this.startScreen.onStateTransition((newState) => {
            this.gameState.transitionTo(newState);
        });
        
        // Connect faction selection to state management
        this.factionSelection.onFactionSelection((faction) => {
            this.gameState.setSelectedFaction(faction);
            this.statusPanel.setFaction(faction);
            this.worldMap.setPlayerFaction(faction);
            this.targetManager.setPlayerFaction(faction);
            this.eventLog.addEvent(`Faction selected: ${faction}`, 'user');
            
            // Escalate DEFCON when faction is selected
            this.defconSystem.escalate('FACTION_ALERT');
            this.statusPanel.setDefcon(this.defconSystem.getCurrentLevel());
            this.eventLog.addEvent(`DEFCON level changed to ${this.defconSystem.getCurrentLevel()}`, 'system');
        });
        
        this.factionSelection.onStateTransition((newState) => {
            this.gameState.transitionTo(newState);
        });
        
        // Connect DEFCON system to status panel
        this.statusPanel.setDefconSystem(this.defconSystem);
        this.statusPanel.setCasualtySystem(this.casualtySystem);
        
        // Connect DEFCON level changes to event log
        this.defconSystem.onLevelChange((event) => {
            this.statusPanel.setDefcon(event.to);
            this.eventLog.addEvent(`DEFCON ${event.from} → ${event.to}`, 'warning');
        });
        
        // Connect casualty events to status panel and event log
        this.casualtySystem.onCasualtyEvent((event) => {
            this.statusPanel.addCasualties(event.faction, event.casualties);
            const factionName = event.faction === 'us' ? 'US' : 'USSR';
            this.eventLog.addEvent(`${factionName} casualties: +${this.casualtySystem.formatNumber(event.casualties)}`, 'error');
        });

        // Connect world map to faction assets and target manager
        this.worldMap.setFactionAssets(this.factionAssets);
        this.worldMap.setTargetManager(this.targetManager);
        this.worldMap.setMissileVisualization(this.missileVisualization);

        // Connect asset interactions
        this.worldMap.onAssetHover((hoverData) => {
            this.eventLog.addEvent(`Asset hover: ${hoverData.displayName}`, 'info');
        });

        this.worldMap.onAssetClick((selectionData) => {
            const asset = selectionData.asset;
            this.eventLog.addEvent(`Asset selected: ${asset.name} (${asset.type})`, 'user');
            
            // Handle launch site selection
            if (this.targetManager.isPlayerAsset(asset)) {
                if (this.missileSystem.canLaunchFrom(asset)) {
                    this.missileSystem.selectLaunchSite(asset);
                    this.eventLog.addEvent(`Launch site selected: ${asset.name}`, 'system');
                }
            }
            // Handle target selection
            else if (this.targetManager.isEnemyAsset(asset)) {
                this.missileSystem.selectTarget(asset);
                this.eventLog.addEvent(`Target acquired: ${asset.name}`, 'warning');
                
                // If both launch site and target are selected, show launch option
                if (this.missileSystem.canLaunch()) {
                    this.eventLog.addEvent('LAUNCH SEQUENCE READY - Press L to launch missile', 'system');
                }
            }
        });

        // Connect missile system events
        this.missileSystem.setPlayerFaction(this.gameState.getSelectedFaction() || 'us');
        
        // Connect AI opponent to game systems
        this.aiOpponent.setDefconLevel(this.defconSystem.getCurrentLevel());
        
        // Set up AI assets (USSR faction)
        const aiAssets = this.factionAssets.getAssetsByFaction('ussr').filter(asset => 
            asset.type === 'militaryBase' || asset.type === 'submarine'
        );
        this.aiOpponent.setAvailableAssets(aiAssets);
        
        this.missileSystem.onLaunch((launchEvent) => {
            this.eventLog.addEvent(`MISSILE LAUNCHED: ${launchEvent.launchSite.name} → ${launchEvent.target.name}`, 'warning');
            this.defconSystem.escalate('NUCLEAR_LAUNCH');
            
            // Notify AI of player attack
            if (launchEvent.target.faction === 'ussr') {
                this.aiOpponent.processPlayerAttack(launchEvent);
            }
        });

        this.missileSystem.onImpact((impactEvent) => {
            // Process impact with enhanced impact system
            const impactResult = this.impactSystem.processImpact(impactEvent);
            
            this.eventLog.addEvent(`NUCLEAR IMPACT: ${impactEvent.target.name} ${impactResult.targetDestroyed ? 'DESTROYED' : 'DAMAGED'}`, 'error');
            this.eventLog.addEvent(`Casualties: ${this.casualtySystem.formatNumber(impactResult.casualties)} (${impactResult.casualtyBreakdown.immediate} immediate, ${impactResult.casualtyBreakdown.radiation} radiation)`, 'warning');
            
            // Show enhanced explosion visualization
            this.missileVisualization.showExplosion(
                impactEvent.missileId,
                impactEvent.impactPosition,
                impactEvent.yield
            );
            
            // Remove missile and trajectory visualization
            this.missileVisualization.removeMissile(impactEvent.missileId);
            this.missileVisualization.removeTrajectory(impactEvent.missileId);
            
            // Mark target as destroyed
            if (impactResult.targetDestroyed) {
                this.factionAssets.setAssetStatus(impactEvent.target.id, 'destroyed');
            }
            
            // Update casualty system with precise impact results
            this.casualtySystem.addCasualties(impactEvent.target.faction, impactResult.casualties);
            
            // Escalate DEFCON for nuclear impact
            this.defconSystem.escalate('NUCLEAR_IMPACT');
            
            // Check for endgame conditions after player impact
            this.checkEndgameConditions();
        });

        this.missileSystem.onMissileAnimation((animationEvent) => {
            this.missileVisualization.updateMissilePosition(
                animationEvent.missileId,
                animationEvent.position,
                animationEvent.progress
            );
        });

        // Connect impact system events
        this.impactSystem.onImpact((impactResult) => {
            // Additional impact processing
            if (impactResult.infrastructureDamage) {
                this.eventLog.addEvent(`Infrastructure damage: ${Math.floor(impactResult.infrastructureDamage.totalDamagePercent * 100)}%`, 'warning');
            }
            
            if (impactResult.radiationZone) {
                this.eventLog.addEvent(`Radiation zone created (radius: ${Math.floor(impactResult.radiationZone.radius)})`, 'warning');
            }
        });
        
        // Connect AI opponent events
        this.aiOpponent.onRetaliation((retaliationEvent) => {
            this.eventLog.addEvent(`AI RETALIATION: ${retaliationEvent.launchSite.id} targeting ${retaliationEvent.target.name}`, 'error');
            
            // Launch AI missile through missile system
            this.launchAIMissile(retaliationEvent);
        });
        
        this.aiOpponent.onStrategyChange((strategyEvent) => {
            this.eventLog.addEvent(`AI threat level: ${strategyEvent.threatLevel} (DEFCON ${strategyEvent.defconLevel})`, 'system');
            
            // Update status panel with new AI threat level
            if (this.statusPanel) {
                this.statusPanel.setAIThreatLevel(strategyEvent.threatLevel);
            }
        });
        
        // Connect DEFCON changes to AI (DefconSystem has onLevelChange)
        if (this.defconSystem.onLevelChange) {
            this.defconSystem.onLevelChange((event) => {
                this.aiOpponent.setDefconLevel(event.newLevel);
            });
        }
        
        // Note: CasualtySystem updates will be handled through impact events directly
        
        // Connect endgame detection
        this.endgameDetector.onEndgameTriggered((endgameEvent) => {
            this.handleEndgame(endgameEvent);
        });
        
        // Connect DRAW screen to WOPR transition
        this.drawScreen.onWOPRTransition((transitionEvent) => {
            this.handleWOPRTransition(transitionEvent);
        });
        
        // Connect WOPR simulation events
        this.woprSimulation.onScenarioComplete((scenario) => {
            this.woprVisualization.displayScenario(scenario);
            this.woprVisualization.updateScenarioCount(this.woprSimulation.getScenarioCount());
        });
        
        this.woprSimulation.onVisualUpdate((visualState) => {
            this.woprVisualization.updateProgress(visualState.progress);
            this.woprVisualization.updateStatistics(visualState.statistics);
        });
        
        this.woprSimulation.onSimulationComplete((completionData) => {
            this.woprVisualization.showConclusion();
            this.eventLog.addEvent(`WOPR: ${completionData.totalScenarios} scenarios analyzed - All results: DRAW`, 'system');
        });
        
        // Connect WOPR visualization to final message transition
        this.woprVisualization.onFinalMessageTransition((transitionEvent) => {
            this.handleFinalMessageTransition(transitionEvent);
        });
        
        // Connect final message events
        this.finalMessage.onRestart((restartEvent) => {
            this.handleGameRestart(restartEvent);
        });
        
        // Connect game reset events
        this.gameReset.onSystemReset((resetEvent) => {
            this.handleSystemReset(resetEvent);
        });
        
        this.gameReset.onUIReset((uiResetEvent) => {
            this.handleUIReset(uiResetEvent);
        });
        
        this.gameReset.onCompletion((completionEvent) => {
            this.handleResetCompletion(completionEvent);
        });
    }

    /**
     * Process nuclear impact for new missile system
     */
    processNuclearImpact(targetName, targetCoords, faction = 'us', yield_kt = 500) {
        console.log(`=== PROCESSING NUCLEAR IMPACT ===`);
        console.log(`Target: ${targetName}`, targetCoords);
        console.log(`Faction: ${faction}, Yield: ${yield_kt}kt`);
        
        // Create impact event similar to old missile system
        const impactEvent = {
            missileId: `missile_${Date.now()}`,
            target: {
                name: targetName,
                faction: faction,
                coordinates: targetCoords,
                type: 'city',
                population: 500000, // Default urban population
                infrastructure: {}
            },
            impactPosition: targetCoords,
            yield: yield_kt,
            timestamp: Date.now()
        };

        // Process impact with enhanced impact system
        const impactResult = this.impactSystem.processImpact(impactEvent);
        
        this.eventLog.addEvent(`NUCLEAR IMPACT: ${impactEvent.target.name} ${impactResult.targetDestroyed ? 'DESTROYED' : 'DAMAGED'}`, 'error');
        this.eventLog.addEvent(`Casualties: ${this.casualtySystem.formatNumber(impactResult.casualties)} (${impactResult.casualtyBreakdown.immediate} immediate, ${impactResult.casualtyBreakdown.radiation} radiation)`, 'warning');
        
        // Update casualty system with precise impact results
        this.casualtySystem.addCasualties(impactEvent.target.faction, impactResult.casualties);
        
        // Escalate DEFCON for nuclear impact
        this.defconSystem.escalate('NUCLEAR_IMPACT');
        
        // Check for endgame conditions after impact
        this.checkEndgameConditions();
        
        return impactResult;
    }

    /**
     * Launch missile at specific country (new precision targeting)
     */
    launchMissileAtCountry(countryTarget) {
        console.log(`=== PLAYER COUNTRY MISSILE LAUNCH ===`);
        console.log(`Target country: ${countryTarget.countryName} (${countryTarget.countryCode.toUpperCase()})`);
        console.log(`Target continent: ${countryTarget.continentName}`);
        console.log(`Target lat/lng:`, countryTarget.coordinates);
        
        // Debug: Check SVG coordinates conversion
        if (this.missileVisualization && this.missileVisualization.latLngToSVG) {
            const svgCoords = this.missileVisualization.latLngToSVG(
                countryTarget.coordinates.lat, 
                countryTarget.coordinates.lng
            );
            console.log(`Target SVG coordinates:`, svgCoords);
        }
        
        const targetCoords = countryTarget.coordinates;
        const targetName = countryTarget.countryName;
        
        // Get player's selected faction
        const playerFaction = this.gameState.getSelectedFaction();
        
        // Create faction-specific launch sites
        const natoLaunchSites = [
            { lat: 41.89, lng: -87.63, name: 'Midwest Silo', faction: 'US', color: '#0066ff' },       // Chicago, USA
            { lat: 47.61, lng: -122.33, name: 'Pacific Fleet', faction: 'US', color: '#0066ff' },     // Seattle, USA
            { lat: 32.78, lng: -117.23, name: 'West Coast Base', faction: 'US', color: '#0066ff' },   // San Diego, USA
            { lat: 51.5074, lng: -0.1278, name: 'RAF Command', faction: 'NATO', color: '#0066ff' },   // London, UK
            { lat: 48.8566, lng: 2.3522, name: 'NATO France', faction: 'NATO', color: '#0066ff' },    // Paris, France
            { lat: 52.5200, lng: 13.4050, name: 'NATO Germany', faction: 'NATO', color: '#0066ff' },  // Berlin, Germany
            { lat: 45.4215, lng: -75.6972, name: 'NORAD North', faction: 'NATO', color: '#0066ff' },  // Ottawa, Canada
            { lat: 41.9028, lng: 12.4964, name: 'NATO South', faction: 'NATO', color: '#0066ff' }     // Rome, Italy
        ];

        const sovietLaunchSites = [
            { lat: 55.75, lng: 37.62, name: 'Moscow Command', faction: 'USSR', color: '#ff0000' },      // Moscow, USSR
            { lat: 60.0, lng: 30.3, name: 'Northern Fleet', faction: 'USSR', color: '#ff0000' },       // St. Petersburg, USSR
            { lat: 52.2297, lng: 21.0122, name: 'Warsaw Pact', faction: 'USSR', color: '#ff0000' },    // Warsaw, Poland
            { lat: 50.0755, lng: 14.4378, name: 'Prague Base', faction: 'USSR', color: '#ff0000' },    // Prague, Czechoslovakia
            { lat: 47.4979, lng: 19.0402, name: 'Budapest Command', faction: 'USSR', color: '#ff0000' }, // Budapest, Hungary
            { lat: 44.4268, lng: 26.1025, name: 'Bucharest Station', faction: 'USSR', color: '#ff0000' }, // Bucharest, Romania
            { lat: 39.9042, lng: 116.4074, name: 'Beijing Alliance', faction: 'USSR', color: '#ff0000' }, // Beijing, China
            { lat: 40.1792, lng: 44.4991, name: 'Caucasus Base', faction: 'USSR', color: '#ff0000' }   // Yerevan, Armenia
        ];

        // Select launch sites based on player's faction
        const playerLaunchSites = playerFaction === 'UNITED STATES' ? natoLaunchSites : sovietLaunchSites;
        const randomLaunch = playerLaunchSites[Math.floor(Math.random() * playerLaunchSites.length)];
        
        console.log(`Player launch site selected:`, randomLaunch);
        
        // Show missile launch animation with coordinated impact
        try {
            this.worldMap.showMissileLaunch(randomLaunch, targetCoords, {
                duration: 3000,
                missileType: 'ICBM',
                magnitude: 'large',
                color: randomLaunch.color, // Use faction-based color
                onComplete: (missileId) => {
                    // Process nuclear impact with casualty calculations (enemy faction gets casualties)
                    const enemyFaction = playerFaction === 'UNITED STATES' ? 'ussr' : 'us';
                    this.processNuclearImpact(targetName, targetCoords, enemyFaction, 500);
                    
                    // Trigger country-specific retaliation after impact
                    setTimeout(() => {
                        this.launchRetaliationStrikeAtCountry(countryTarget);
                    }, 2000);
                }
            });
            
            this.eventLog.addEvent(`PLAYER ${randomLaunch.faction} MISSILE LAUNCHED: ${randomLaunch.name} → ${targetName}`, 'warning');
            
        } catch (error) {
            console.error('Error showing missile launch:', error);
            this.eventLog.addEvent(`Missile targeting ${targetName}`, 'warning');
        }
    }

    /**
     * Launch missile at continent (legacy support)
     */
    launchMissileAtContinent(continentName) {
        console.log(`=== CONTINENT MISSILE LAUNCH (LEGACY) ===`);
        console.log(`Target continent: ${continentName}`);
        
        // Get continent center coordinates
        const continentCenter = this.worldMap.getContinentCenter(continentName);
        console.log(`Retrieved coordinates:`, continentCenter);
        
        if (!continentCenter) {
            console.warn(`No coordinates found for continent: ${continentName}`);
            return;
        }

        // Get player's selected faction for legacy continent targeting
        const playerFaction = this.gameState.getSelectedFaction();
        
        // Create faction-specific launch sites (legacy)
        const natoLaunchSites = [
            { lat: 41.89, lng: -87.63, name: 'Midwest Silo', faction: 'US', color: '#0066ff' },       // Chicago, USA
            { lat: 47.61, lng: -122.33, name: 'Pacific Fleet', faction: 'US', color: '#0066ff' },     // Seattle, USA
            { lat: 32.78, lng: -117.23, name: 'West Coast Base', faction: 'US', color: '#0066ff' },   // San Diego, USA
            { lat: 51.5074, lng: -0.1278, name: 'RAF Command', faction: 'NATO', color: '#0066ff' },   // London, UK
            { lat: 48.8566, lng: 2.3522, name: 'NATO France', faction: 'NATO', color: '#0066ff' },    // Paris, France
            { lat: 52.5200, lng: 13.4050, name: 'NATO Germany', faction: 'NATO', color: '#0066ff' },  // Berlin, Germany
            { lat: 45.4215, lng: -75.6972, name: 'NORAD North', faction: 'NATO', color: '#0066ff' },  // Ottawa, Canada
            { lat: 41.9028, lng: 12.4964, name: 'NATO South', faction: 'NATO', color: '#0066ff' }     // Rome, Italy
        ];

        const sovietLaunchSites = [
            { lat: 55.75, lng: 37.62, name: 'Moscow Command', faction: 'USSR', color: '#ff0000' },      // Moscow, USSR
            { lat: 60.0, lng: 30.3, name: 'Northern Fleet', faction: 'USSR', color: '#ff0000' },       // St. Petersburg, USSR
            { lat: 52.2297, lng: 21.0122, name: 'Warsaw Pact', faction: 'USSR', color: '#ff0000' },    // Warsaw, Poland
            { lat: 50.0755, lng: 14.4378, name: 'Prague Base', faction: 'USSR', color: '#ff0000' },    // Prague, Czechoslovakia
            { lat: 47.4979, lng: 19.0402, name: 'Budapest Command', faction: 'USSR', color: '#ff0000' }, // Budapest, Hungary
            { lat: 44.4268, lng: 26.1025, name: 'Bucharest Station', faction: 'USSR', color: '#ff0000' }, // Bucharest, Romania
            { lat: 39.9042, lng: 116.4074, name: 'Beijing Alliance', faction: 'USSR', color: '#ff0000' }, // Beijing, China
            { lat: 40.1792, lng: 44.4991, name: 'Caucasus Base', faction: 'USSR', color: '#ff0000' }   // Yerevan, Armenia
        ];

        // Select launch sites based on player's faction (legacy)
        const playerLaunchSites = playerFaction === 'UNITED STATES' ? natoLaunchSites : sovietLaunchSites;
        const randomLaunch = playerLaunchSites[Math.floor(Math.random() * playerLaunchSites.length)];
        
        // Show missile launch animation with coordinated impact
        try {
            this.worldMap.showMissileLaunch(randomLaunch, continentCenter, {
                duration: 3000,
                missileType: 'ICBM',
                magnitude: 'large',
                color: randomLaunch.color, // Use faction-based color
                onComplete: (missileId) => {
                    // Process legacy continent nuclear impact with casualty calculations (enemy faction gets casualties)
                    const enemyFaction = playerFaction === 'UNITED STATES' ? 'ussr' : 'us';
                    this.processNuclearImpact(continentName, continentCenter, enemyFaction, 500);
                    
                    // Trigger AI retaliation after impact
                    setTimeout(() => {
                        this.launchRetaliationStrike(continentName);
                    }, 2000);
                }
            });
            
            this.eventLog.addEvent(`PLAYER ${randomLaunch.faction} LEGACY MISSILE: ${randomLaunch.name} → ${continentName}`, 'warning');
            
        } catch (error) {
            console.error('Error showing missile launch:', error);
            this.eventLog.addEvent(`Missile targeting ${continentName}`, 'warning');
        }
    }

    /**
     * Launch retaliation strike at specific country
     */
    launchRetaliationStrikeAtCountry(originalCountryTarget) {
        console.log(`=== COUNTRY RETALIATION STRIKE ===`);
        console.log(`Original target: ${originalCountryTarget.countryName} (${originalCountryTarget.continentName})`);
        
        // Determine retaliation targets based on continent and specific countries
        const retaliationTargets = {
            'NORTH_AMERICA': ['ru', 'cn', 'kp'], // Strike Russia, China, or North Korea
            'EUROPE': ['us', 'ca'],              // Strike US or Canada
            'ASIA': ['us', 'gb', 'fr'],          // Strike US, UK, or France
            'AFRICA': ['fr', 'gb', 'de'],        // Strike former colonial powers
            'SOUTH_AMERICA': ['us', 'gb'],       // Strike US or UK
            'AUSTRALIA': ['cn', 'id', 'jp']      // Strike regional powers
        };

        const possibleTargets = retaliationTargets[originalCountryTarget.continentName];
        if (!possibleTargets || possibleTargets.length === 0) {
            console.warn(`No retaliation targets defined for ${originalCountryTarget.continentName}`);
            return;
        }

        // Select random retaliation target country
        const targetCountryCode = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
        const retaliationTarget = this.worldMap.getCountryCoordinates(targetCountryCode);
        
        if (!retaliationTarget) {
            console.warn(`No coordinates found for retaliation target: ${targetCountryCode}`);
            return;
        }

        // Get player's faction to determine enemy faction
        const playerFaction = this.gameState.getSelectedFaction();
        
        // Enemy faction launch sites (opposite of player's faction)
        const sovietEnemySites = [
            { lat: 55.75, lng: 37.62, name: 'Moscow Command', faction: 'USSR', color: '#ff0000' },      // Moscow, USSR
            { lat: 60.0, lng: 30.3, name: 'Northern Fleet', faction: 'USSR', color: '#ff0000' },       // St. Petersburg, USSR
            { lat: 52.2297, lng: 21.0122, name: 'Warsaw Pact', faction: 'USSR', color: '#ff0000' },    // Warsaw, Poland
            { lat: 50.0755, lng: 14.4378, name: 'Prague Base', faction: 'USSR', color: '#ff0000' },    // Prague, Czechoslovakia
            { lat: 39.9042, lng: 116.4074, name: 'Beijing Alliance', faction: 'USSR', color: '#ff0000' } // Beijing, China
        ];

        const natoEnemySites = [
            { lat: 41.89, lng: -87.63, name: 'Midwest Silo', faction: 'US', color: '#0066ff' },       // Chicago, USA
            { lat: 47.61, lng: -122.33, name: 'Pacific Fleet', faction: 'US', color: '#0066ff' },     // Seattle, USA
            { lat: 51.5074, lng: -0.1278, name: 'RAF Command', faction: 'NATO', color: '#0066ff' },   // London, UK
            { lat: 48.8566, lng: 2.3522, name: 'NATO France', faction: 'NATO', color: '#0066ff' },    // Paris, France
            { lat: 52.5200, lng: 13.4050, name: 'NATO Germany', faction: 'NATO', color: '#0066ff' }   // Berlin, Germany
        ];

        // Enemy retaliates from opposite faction's sites
        const enemyLaunchSites = playerFaction === 'UNITED STATES' ? sovietEnemySites : natoEnemySites;
        const launchSite = enemyLaunchSites[Math.floor(Math.random() * enemyLaunchSites.length)];
        
        // Debug: Log retaliation details
        console.log(`=== RETALIATION DEBUG ===`);
        console.log(`Original target continent: ${originalCountryTarget.continentName}`);
        console.log(`Launch site selected:`, launchSite);
        console.log(`Available launch sites:`, Object.keys(enemyLaunchSites));
        
        try {
            this.worldMap.showMissileLaunch(launchSite, retaliationTarget, {
                duration: 2500,
                missileType: 'ICBM',
                magnitude: 'large',
                color: launchSite.color, // Use faction-based color
                onComplete: (missileId) => {
                    // Process retaliation nuclear impact with casualty calculations (player's faction gets casualties)
                    const playerCasualtyFaction = playerFaction === 'UNITED STATES' ? 'us' : 'ussr';
                    this.processNuclearImpact(retaliationTarget.name, retaliationTarget, playerCasualtyFaction, 500);
                }
            });
            
            this.eventLog.addEvent(`AI ${launchSite.faction} RETALIATION: ${launchSite.name} → ${retaliationTarget.name}`, 'error');
            
        } catch (error) {
            console.error('Error showing country retaliation strike:', error);
        }
    }

    /**
     * Launch retaliation strike (legacy continent-based)
     */
    launchRetaliationStrike(originalTarget) {
        // Determine retaliation target (opposite faction's territory)
        const retaliationTargets = {
            'NORTH_AMERICA': { lat: 55, lng: 83, name: 'ASIA' },      // Strike Asia in response to North America
            'EUROPE': { lat: 40, lng: -100, name: 'NORTH_AMERICA' }, // Strike North America in response to Europe
            'ASIA': { lat: 40, lng: -100, name: 'NORTH_AMERICA' },   // Strike North America in response to Asia
            'AFRICA': { lat: 55, lng: 15, name: 'EUROPE' },          // Strike Europe in response to Africa
            'SOUTH_AMERICA': { lat: 55, lng: 15, name: 'EUROPE' },   // Strike Europe in response to South America
            'AUSTRALIA': { lat: 35, lng: 110, name: 'ASIA' }         // Strike Asia in response to Australia
        };

        const retaliation = retaliationTargets[originalTarget];
        if (!retaliation) return;

        // Get player's faction to determine enemy faction for legacy retaliation
        const playerFaction = this.gameState.getSelectedFaction();
        
        // Enemy faction launch sites (opposite of player's faction) for legacy retaliation
        const sovietEnemySites = [
            { lat: 55.75, lng: 37.62, name: 'Moscow Command', faction: 'USSR', color: '#ff0000' },      // Moscow, USSR
            { lat: 60.0, lng: 30.3, name: 'Northern Fleet', faction: 'USSR', color: '#ff0000' },       // St. Petersburg, USSR
            { lat: 52.2297, lng: 21.0122, name: 'Warsaw Pact', faction: 'USSR', color: '#ff0000' },    // Warsaw, Poland
            { lat: 39.9042, lng: 116.4074, name: 'Beijing Alliance', faction: 'USSR', color: '#ff0000' } // Beijing, China
        ];

        const natoEnemySites = [
            { lat: 41.89, lng: -87.63, name: 'Midwest Silo', faction: 'US', color: '#0066ff' },       // Chicago, USA
            { lat: 47.61, lng: -122.33, name: 'Pacific Fleet', faction: 'US', color: '#0066ff' },     // Seattle, USA
            { lat: 51.5074, lng: -0.1278, name: 'RAF Command', faction: 'NATO', color: '#0066ff' },   // London, UK
            { lat: 48.8566, lng: 2.3522, name: 'NATO France', faction: 'NATO', color: '#0066ff' }     // Paris, France
        ];

        // Enemy retaliates from opposite faction's sites (legacy)
        const enemyLaunchSites = playerFaction === 'UNITED STATES' ? sovietEnemySites : natoEnemySites;
        const enemyLaunchSite = enemyLaunchSites[Math.floor(Math.random() * enemyLaunchSites.length)];
        
        try {
            this.worldMap.showMissileLaunch(enemyLaunchSite, retaliation, {
                duration: 2500,
                missileType: 'ICBM',
                magnitude: 'large',
                color: enemyLaunchSite.color, // Use faction-based color
                onComplete: (missileId) => {
                    // Process legacy retaliation nuclear impact with casualty calculations (player's faction gets casualties)
                    const playerCasualtyFaction = playerFaction === 'UNITED STATES' ? 'us' : 'ussr';
                    this.processNuclearImpact(retaliation.name, retaliation, playerCasualtyFaction, 500);
                }
            });
            
            this.eventLog.addEvent(`AI ${enemyLaunchSite.faction} LEGACY RETALIATION: ${enemyLaunchSite.name} → ${retaliation.name}`, 'error');
            
        } catch (error) {
            console.error('Error showing retaliation strike:', error);
        }
    }

    /**
     * Launch AI missile (simulates AI retaliation)
     */
    launchAIMissile(retaliationEvent) {
        // Create AI missile launch event
        const aiLaunchEvent = {
            source: 'ai',
            launchSite: retaliationEvent.launchSite,
            target: retaliationEvent.target,
            missileType: 'ICBM',
            yield: 550
        };
        
        // Process through missile system
        const missileId = `ai_missile_${Date.now()}`;
        const trajectory = this.missileSystem.calculateTrajectory(
            retaliationEvent.launchSite.coordinates,
            retaliationEvent.target.coordinates,
            'ICBM'
        );
        
        // Draw trajectory and animate
        this.missileVisualization.drawTrajectory(missileId, trajectory, '#ff0000'); // Red for AI missiles
        
        // Calculate travel time and animate
        const travelTime = this.missileSystem.calculateTravelTime(trajectory, 'ICBM');
        this.missileSystem.animateMissile(missileId, trajectory, travelTime, Date.now());
        
        // Schedule impact
        setTimeout(() => {
            const impactEvent = {
                missileId: missileId,
                target: retaliationEvent.target,
                impactPosition: retaliationEvent.target.coordinates,
                yield: 550,
                timestamp: Date.now()
            };
            
            this.processAIImpact(impactEvent);
        }, travelTime);
    }

    /**
     * Process AI missile impact
     */
    processAIImpact(impactEvent) {
        // Process impact with impact system
        const impactResult = this.impactSystem.processImpact(impactEvent);
        
        this.eventLog.addEvent(`AI NUCLEAR IMPACT: ${impactEvent.target.name} ${impactResult.targetDestroyed ? 'DESTROYED' : 'DAMAGED'}`, 'error');
        this.eventLog.addEvent(`AI Attack Casualties: ${this.casualtySystem.formatNumber(impactResult.casualties)}`, 'error');
        
        // Show explosion visualization  
        this.missileVisualization.showExplosion(
            impactEvent.missileId,
            impactEvent.impactPosition,
            impactEvent.yield
        );
        
        // Remove missile visualization
        this.missileVisualization.removeMissile(impactEvent.missileId);
        this.missileVisualization.removeTrajectory(impactEvent.missileId);
        
        // Mark target as destroyed
        if (impactResult.targetDestroyed) {
            this.factionAssets.setAssetStatus(impactEvent.target.id, 'destroyed');
        }
        
        // Update casualty system
        this.casualtySystem.addCasualties(impactEvent.target.faction, impactResult.casualties);
        
        // Escalate DEFCON due to AI attack
        this.defconSystem.escalate('NUCLEAR_IMPACT');
        
        // Check for endgame conditions after AI impact
        this.checkEndgameConditions();
    }

    /**
     * Check for endgame conditions
     */
    checkEndgameConditions() {
        // Prevent endgame checks if already in endgame
        if (this.endgameDetector.isEndgameActive()) {
            return;
        }
        
        const gameState = {
            us: {
                casualties: this.casualtySystem.getCasualties('us'),
                assetsDestroyed: this.factionAssets.getDestroyedAssetCount('us'),
                totalAssets: this.factionAssets.getTotalAssetCount('us')
            },
            ussr: {
                casualties: this.casualtySystem.getCasualties('ussr'),
                assetsDestroyed: this.factionAssets.getDestroyedAssetCount('ussr'),
                totalAssets: this.factionAssets.getTotalAssetCount('ussr')
            }
        };
        
        // Evaluate for mutual destruction
        this.endgameDetector.evaluateGameState(gameState);
    }

    /**
     * Handle endgame trigger
     */
    handleEndgame(endgameEvent) {
        console.log('Endgame triggered:', endgameEvent);
        
        // Disable further gameplay
        this.gameState.setState('ENDGAME');
        
        // Calculate final statistics
        const finalStats = this.calculateFinalStatistics();
        
        // Display DRAW screen
        this.drawScreen.render(finalStats);
        
        // Log endgame message
        this.eventLog.addEvent('MUTUAL DESTRUCTION ACHIEVED - WAR ENDED IN DRAW', 'error');
        this.eventLog.addEvent('The only winning move is not to play', 'system');
    }

    /**
     * Calculate final statistics for endgame display
     */
    calculateFinalStatistics() {
        const usCasualties = this.casualtySystem.getCasualties('us');
        const ussrCasualties = this.casualtySystem.getCasualties('ussr');
        const totalCasualties = usCasualties + ussrCasualties;
        
        const conflictDuration = this.endgameDetector.conflictStartTime ? 
            Date.now() - this.endgameDetector.conflictStartTime : 120000;
        
        const gameState = {
            us: {
                casualties: usCasualties,
                assetsDestroyed: this.factionAssets.getDestroyedAssetCount('us'),
                totalAssets: this.factionAssets.getTotalAssetCount('us')
            },
            ussr: {
                casualties: ussrCasualties,
                assetsDestroyed: this.factionAssets.getDestroyedAssetCount('ussr'),
                totalAssets: this.factionAssets.getTotalAssetCount('ussr')
            }
        };
        
        const destructionAnalysis = this.endgameDetector.checkMutualDestruction(gameState);
        
        return {
            totalCasualties,
            usCasualties,
            ussrCasualties,
            conflictDuration,
            destructionLevel: destructionAnalysis.destructionLevel,
            defconLevel: this.defconSystem.getCurrentLevel()
        };
    }

    /**
     * Handle transition to WOPR simulation
     */
    handleWOPRTransition(transitionEvent) {
        console.log('Transitioning to WOPR simulation:', transitionEvent);
        
        // Hide DRAW screen
        this.drawScreen.hide();
        
        // Transition to WOPR state
        this.gameState.setState('WOPR');
        
        // Render WOPR visualization screen
        this.woprVisualization.render();
        this.woprVisualization.addVisualEffects();
        
        // Start WOPR simulation
        setTimeout(() => {
            this.woprSimulation.setSimulationSpeed('FAST'); // Dramatic speed for demonstration
            this.woprSimulation.startSimulation();
        }, 1000);
        
        // Add transitional message
        this.eventLog.addEvent('WOPR analyzing thousands of nuclear warfare scenarios...', 'system');
    }

    /**
     * Handle final message transition
     */
    handleFinalMessageTransition(transitionEvent) {
        console.log('Transitioning to final message:', transitionEvent);
        
        // Hide WOPR visualization
        this.woprVisualization.hide();
        
        // Transition to FINAL state
        this.gameState.setState('FINAL');
        
        // Render final message screen
        this.finalMessage.render();
        
        // Display the iconic final message with dramatic timing
        setTimeout(() => {
            this.finalMessage.displayFinalMessage();
        }, 1000);
        
        // Add transitional message
        this.eventLog.addEvent('WOPR analysis complete. Delivering final conclusion...', 'system');
    }

    /**
     * Handle game restart
     */
    handleGameRestart(restartEvent) {
        console.log('Handling game restart:', restartEvent);
        
        if (restartEvent.action === 'RESTART') {
            // Hide final message
            this.finalMessage.hide();
            
            // Capture current state for reset
            this.gameReset.setCurrentState({
                gameState: this.gameState.getCurrentState(),
                scenarioCount: this.woprSimulation.getScenarioCount(),
                casualties: this.casualtySystem.getCasualties(),
                defconLevel: this.defconSystem.getCurrentLevel(),
                faction: this.factionSelection.getSelectedFaction()
            });
            
            // Perform complete reset
            this.gameReset.resetAllSystems();
            
        } else if (restartEvent.action === 'EXIT') {
            // Handle exit request
            this.eventLog.addEvent('Thank you for playing Global Thermonuclear War', 'system');
        }
    }

    /**
     * Handle system reset
     */
    handleSystemReset(resetEvent) {
        console.log('Handling system reset:', resetEvent);
        
        // Reset game state
        this.gameState.setState('START');
        
        // Reset DEFCON level
        this.defconSystem.setLevel(5);
        
        // Reset casualties
        this.casualtySystem.reset();
        
        // Reset faction selection
        this.factionSelection.reset();
        
        // Reset AI opponent
        this.aiOpponent.reset();
        
        // Reset missile system
        this.missileSystem.reset();
        
        // Reset endgame detector
        this.endgameDetector.reset();
        
        // Reset WOPR simulation
        this.woprSimulation.reset();
        
        // Reset final message
        this.finalMessage.reset();
    }

    /**
     * Handle UI reset
     */
    handleUIReset(uiResetEvent) {
        console.log('Handling UI reset:', uiResetEvent);
        
        // Clear event log
        this.eventLog.clear();
        
        // Reset world map
        this.worldMap.reset();
        
        // Reset status panel
        this.statusPanel.reset();
        
        // Hide all screens
        this.drawScreen.hide();
        this.woprVisualization.hide();
        this.finalMessage.hide();
    }

    /**
     * Handle reset completion
     */
    handleResetCompletion(completionEvent) {
        console.log('Reset completion:', completionEvent);
        
        // Show start screen
        this.screenManager.showScreen('start');
        
        // Add welcome message
        this.eventLog.addEvent('Welcome back to Global Thermonuclear War', 'system');
        this.eventLog.addEvent('Shall we play a game?', 'system');
        
        // Validation
        const validation = completionEvent.validation;
        if (validation.ready) {
            console.log('Game successfully reset and ready for new game');
        } else {
            console.warn('Reset validation failed:', validation);
        }
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('WOPR SYSTEM INITIALIZING...');
            
            // Initialize state management
            this.setupStateManagement();
            
            // Simulate system initialization
            await this.delay(1000);
            
            this.setupEventListeners();
            
            // Sprint 14: Set up performance monitoring and accessibility
            this.setupPerformanceMonitoring();
            this.setupAccessibilityFeatures();
            this.setupMobileOptimizations();
            
            this.initialized = true;
            
            // Start performance monitoring
            if (this.performanceMonitor) {
                this.performanceMonitor.startMonitoring();
            }
            
            console.log('WOPR SYSTEM READY');
            console.log('THE ONLY WINNING MOVE IS NOT TO PLAY');
            console.log(`Initial state: ${this.gameState.getCurrentState()}`);
            
            // Update loading message
            const loadingElement = document.getElementById('loading');
            if (loadingElement) {
                loadingElement.textContent = 'WOPR SYSTEM READY';
                // Start screen will be shown via state management
                setTimeout(() => {
                    this.updateUIComponents(this.gameState.getCurrentState());
                }, 500);
            }
            
            return true;
        } catch (error) {
            console.error('SYSTEM INITIALIZATION FAILED:', error);
            return false;
        }
    }

    /**
     * Set up state management system
     */
    setupStateManagement() {
        // Connect screen manager to DOM
        const appElement = document.getElementById('app');
        this.screenManager.connectToDOM(appElement);
        
        // Render UI components to DOM if app element exists
        if (appElement) {
            this.startScreen.render(appElement);
            this.factionSelection.render(appElement);
            this.worldMap.render(appElement);
            
            // Wait for world map to render, then populate the status containers
            setTimeout(() => {
                const statusContainer = document.getElementById('status-panel-container');
                const eventContainer = document.getElementById('event-log-container');
                
                console.log('Looking for status container:', statusContainer);
                console.log('Looking for event container:', eventContainer);
                
                if (statusContainer) {
                    console.log('Status container found, rendering status panel');
                    this.statusPanel.render(statusContainer);
                    
                    // Initialize with proper faction data
                    if (this.factionSelection.selectedFaction) {
                        const factionName = this.factionSelection.selectedFaction === 'us' ? 'UNITED STATES' : 'SOVIET UNION';
                        this.statusPanel.setFaction(factionName);
                    } else {
                        this.statusPanel.setFaction('UNITED STATES'); // Default for testing
                    }
                    
                    // Make sure it's visible and updated
                    console.log('About to show status panel');
                    this.statusPanel.show();
                    console.log('Status panel show() called');
                    this.statusPanel.startTimer();
                    this.statusPanel.updateDisplay();
                    console.log('Status panel updateDisplay() called');
                    
                    console.log('Status panel rendered and initialized');
                    console.log('Status panel faction:', this.statusPanel.getFaction());
                } else {
                    console.warn('Status panel container not found');
                }
                
                if (eventContainer) {
                    console.log('Event container found, rendering event log');
                    console.log('Event container dimensions:', {
                        height: eventContainer.style.height,
                        maxHeight: eventContainer.style.maxHeight,
                        overflow: eventContainer.style.overflow
                    });
                    this.eventLog.render(eventContainer);
                    // Add initial welcome message
                    this.eventLog.addEvent('Status panels initialized', 'system');
                    console.log('Event log rendered to world map container');
                } else {
                    console.warn('Event log container not found');
                }
            }, 100); // Small delay to ensure DOM containers are ready
        } else {
            console.warn('App element not found, UI components not rendered');
        }
        
        // Log state changes for debugging
        this.gameState.onStateChange((event) => {
            console.log('State change event:', event);
        });
    }

    /**
     * Handle state change events
     */
    handleStateChange(event) {
        console.log(`Game state changed: ${event.from} → ${event.to}`);
        
        // Update screen based on new state
        this.screenManager.transitionToScreen(event.to);
        
        // Handle specific state transitions
        switch (event.to) {
            case 'START':
                this.handleStartState();
                break;
            case 'FACTION_SELECT':
                this.handleFactionSelectState();
                break;
            case 'GAME':
                this.handleGameState();
                break;
            case 'ENDGAME':
                this.handleEndgameState();
                break;
            case 'WOPR':
                this.handleWoprState();
                break;
            case 'FINAL':
                this.handleFinalState();
                break;
        }
        
        // Handle UI component visibility
        this.updateUIComponents(event.to);
    }

    /**
     * State handlers for different game phases
     */
    handleStartState() {
        console.log('Entering START state - showing start screen');
        
        // Hide loading message and show start screen
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    handleFactionSelectState() {
        console.log('Entering FACTION_SELECT state - player chooses side');
    }

    handleGameState() {
        console.log('Entering GAME state - active conflict begins');
        this.statusPanel.startTimer();
        this.eventLog.addEvent('Global Thermonuclear War simulation started', 'system');
        
                    // Add country click handlers for escalation testing
            this.worldMap.onContinentClick((target) => {
                // Handle both old continent-based and new country-based targeting
                if (typeof target === 'string') {
                    // Legacy continent targeting
                    this.eventLog.addEvent(`Continent targeted: ${target}`, 'user');
                    this.launchMissileAtContinent(target);
                } else if (target && target.countryCode) {
                    // New country-based targeting
                    this.eventLog.addEvent(`Country targeted: ${target.countryName} (${target.continentName})`, 'user');
                    this.launchMissileAtCountry(target);
                    
                    // Notify AI opponent if player attacked USSR/opposing faction
                    if (target.continentName === 'EUROPE' || target.continentName === 'ASIA') {
                        // Simulate attack event for AI processing
                        const attackEvent = {
                            target: {
                                id: target.countryCode,
                                name: target.countryName,
                                faction: 'ussr', // Assume attacks on Europe/Asia are against USSR
                                coordinates: target.coordinates
                            },
                            launchSite: {
                                id: 'player_launch',
                                name: 'Player Launch Site'
                            }
                        };
                        this.aiOpponent.processPlayerAttack(attackEvent);
                    }
                }
                
                // Simulate escalation based on targeting actions
                if (Math.random() < 0.3) { // 30% chance of escalation
                    this.defconSystem.escalate('MILITARY_MOVEMENT');
                    this.eventLog.addEvent('Military forces mobilized', 'warning');
                }
                
                // Simulate casualties from military action
                if (Math.random() < 0.2) { // 20% chance of casualties
                    const casualties = Math.floor(Math.random() * 50000) + 10000;
                    const targetFaction = Math.random() < 0.5 ? 'us' : 'ussr';
                    this.casualtySystem.addCasualties(targetFaction, casualties);
                }
            });

                    // Missile visualization will be initialized automatically when SVG loads in WorldMap
                    console.log('Missile visualization will be initialized when SVG loads');
    }

    handleEndgameState() {
        console.log('Entering ENDGAME state - mutual destruction achieved');
    }

    handleWoprState() {
        console.log('Entering WOPR state - running war simulations');
    }

    handleFinalState() {
        console.log('Entering FINAL state - the only winning move is not to play');
    }

    /**
     * Update UI component visibility based on current state
     */
    updateUIComponents(currentState) {
        // Show/hide components based on state
        if (currentState === 'START') {
            this.startScreen.show();
            this.factionSelection.hide();
            this.worldMap.hide();
        } else if (currentState === 'FACTION_SELECT') {
            this.startScreen.hide();
            this.factionSelection.show();
            this.worldMap.hide();
        } else if (currentState === 'GAME') {
            this.startScreen.hide();
            this.factionSelection.hide();
            this.worldMap.show();
            this.statusPanel.show();
            this.eventLog.show();
        } else {
            this.startScreen.hide();
            this.factionSelection.hide();
            this.worldMap.hide();
        }
    }

    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // Prevent context menu for authentic terminal feel
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Handle keyboard input for state progression (temporary for testing)
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }

    /**
     * Handle keyboard input for testing state transitions
     */
    handleKeyPress(event) {
        if (!this.initialized) return;
        
        // Space bar to advance to next state (for testing)
        if (event.code === 'Space') {
            this.advanceState();
            event.preventDefault();
        }
        
        // R key to restart
        if (event.code === 'KeyR') {
            this.restartGame();
            event.preventDefault();
        }
    }

    /**
     * Advance to next valid state (for testing)
     */
    advanceState() {
        const currentState = this.gameState.getCurrentState();
        const metadata = this.gameState.getStateMetadata();
        
        if (metadata.validTransitions.length > 0) {
            const nextState = metadata.validTransitions[0];
            this.gameState.transitionTo(nextState);
        } else {
            console.log('No valid transitions from current state');
        }
    }

    /**
     * Restart the game
     */
    restartGame() {
        console.log('Restarting game...');
        this.gameState.restart();
    }

    /**
     * Handle window resize events
     */
    handleResize() {
        console.log('DISPLAY RECONFIGURED');
    }

    /**
     * Utility method for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if application is ready
     */
    isReady() {
        return this.initialized;
    }

    /**
     * Get application version
     */
    getVersion() {
        return this.version;
    }

    /**
     * Get current game state
     */
    getCurrentState() {
        return this.gameState.getCurrentState();
    }

    /**
     * Get state metadata for debugging
     */
    getStateMetadata() {
        return this.gameState.getStateMetadata();
    }

    /**
     * Get complete state history
     */
    getStateHistory() {
        return this.gameState.getStateHistory();
    }
    
    /**
     * Sprint 14: Set up performance monitoring
     */
    setupPerformanceMonitoring() {
        if (!this.performanceMonitor) return;
        
        console.log('Performance monitoring configured');
    }
    
    /**
     * Sprint 14: Set up accessibility features
     */
    setupAccessibilityFeatures() {
        if (!this.accessibilityEnabled) return;
        
        // Check for reduced motion preference
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.reducedMotion = true;
            document.body.classList.add('reduced-motion');
            console.log('Reduced motion mode enabled');
        }
        
        console.log('Accessibility features configured');
    }
    
    /**
     * Sprint 14: Set up mobile optimizations
     */
    setupMobileOptimizations() {
        if (!this.mobileOptimizations) return;
        
        // Detect mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            document.body.classList.add('mobile-device');
            this.optimizeForMobile();
            console.log('Mobile optimizations enabled');
        }
        
        console.log('Mobile optimization handlers configured');
    }
    
    /**
     * Optimize for low performance devices
     */
    optimizeForLowPerformance() {
        document.body.classList.add('low-performance');
        
        const expensiveElements = document.querySelectorAll('.explosion, .missile-trail');
        expensiveElements.forEach(element => {
            element.style.animation = 'none';
        });
    }
    
    /**
     * Optimize for mobile devices
     */
    optimizeForMobile() {
        document.body.classList.add('mobile-optimized');
        
        const touchTargets = document.querySelectorAll('.game-item, .faction-card, .strategic-asset');
        touchTargets.forEach(target => {
            target.style.minHeight = '44px';
            target.style.minWidth = '44px';
        });
    }
    
    /**
     * Setup touch handlers for mobile
     */
    setupTouchHandlers() {
        document.addEventListener('touchstart', (event) => {
            const target = event.target.closest('.game-item, .faction-card, .strategic-asset');
            if (target) {
                target.classList.add('touch-active');
            }
        });
        
        document.addEventListener('touchend', () => {
            setTimeout(() => {
                const touchActive = document.querySelectorAll('.touch-active');
                touchActive.forEach(element => {
                    element.classList.remove('touch-active');
                });
            }, 150);
        });
    }
    
    /**
     * Handle accessibility keyboard navigation
     */
    handleAccessibilityKeyboard(event) {
        // Basic keyboard navigation support
        if (event.key === 'Tab') {
            this.handleTabNavigation(event);
        }
    }
    
    /**
     * Handle tab navigation
     */
    handleTabNavigation(event) {
        const focusableElements = document.querySelectorAll(
            'button, [role="button"], .game-item, .faction-card, .strategic-asset'
        );
        
        if (focusableElements.length === 0) return;
        
        const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
        
        if (event.shiftKey) {
            const prevIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
            focusableElements[prevIndex].focus();
        } else {
            const nextIndex = currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1;
            focusableElements[nextIndex].focus();
        }
        
        event.preventDefault();
    }
    
    /**
     * Handle activation key (Enter/Space)
     */
    handleActivationKey(event) {
        const activeElement = document.activeElement;
        
        if (activeElement && (activeElement.classList.contains('game-item') || 
                             activeElement.classList.contains('faction-card'))) {
            activeElement.click();
            event.preventDefault();
        }
    }
    
    /**
     * Handle escape key
     */
    handleEscapeKey(event) {
        console.log('Escape key pressed - canceling current action');
        event.preventDefault();
    }
    
    /**
     * Handle arrow navigation
     */
    handleArrowNavigation(event) {
        // Basic arrow key navigation
        const currentElement = document.activeElement;
        const container = currentElement.closest('.game-list, .faction-options');
        
        if (!container) return;
        
        const items = Array.from(container.querySelectorAll('.game-item, .faction-card'));
        const currentIndex = items.indexOf(currentElement);
        
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex;
        
        switch (event.key) {
            case 'ArrowUp':
                nextIndex = Math.max(0, currentIndex - 1);
                break;
            case 'ArrowDown':
                nextIndex = Math.min(items.length - 1, currentIndex + 1);
                break;
        }
        
        if (nextIndex !== currentIndex && items[nextIndex]) {
            items[nextIndex].focus();
            event.preventDefault();
        }
    }
    
    /**
     * Add accessibility labels
     */
    addAccessibilityLabels() {
        const app = document.getElementById('app');
        if (app) {
            app.setAttribute('role', 'main');
            app.setAttribute('aria-label', 'Global Thermonuclear War Simulation');
        }
        
        this.gameState.addStateChangeCallback((oldState, newState) => {
            this.announceStateChange(newState);
        });
    }
    
    /**
     * Announce state changes to screen readers
     */
    announceStateChange(state) {
        const announcer = this.getOrCreateAnnouncer();
        
        const stateDescriptions = {
            'START': 'Welcome to Global Thermonuclear War simulation',
            'FACTION_SELECT': 'Select your faction: United States or Soviet Union',
            'GAME': 'Main game interface loaded. World map and status panel ready',
            'ENDGAME': 'Nuclear exchange complete. Calculating casualties',
            'WOPR': 'WOPR computer analyzing scenarios',
            'FINAL': 'Simulation complete. Final message displayed'
        };
        
        const description = stateDescriptions[state] || `Game state changed to ${state}`;
        announcer.textContent = description;
    }
    
    /**
     * Get or create screen reader announcer element
     */
    getOrCreateAnnouncer() {
        let announcer = document.getElementById('sr-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'sr-announcer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.style.position = 'absolute';
            announcer.style.left = '-10000px';
            announcer.style.width = '1px';
            announcer.style.height = '1px';
            announcer.style.overflow = 'hidden';
            document.body.appendChild(announcer);
        }
        return announcer;
    }
    
    /**
     * Handle orientation changes
     */
    handleOrientationChange() {
        if (this.worldMap && this.worldMap.isVisible()) {
            this.worldMap.redraw();
        }
        this.updateLayoutForOrientation();
    }
    
    /**
     * Handle viewport changes
     */
    handleViewportChange() {
        this.updateResponsiveLayout();
        
        if (window.innerWidth < 768 && window.innerHeight < 600) {
            this.optimizeForSmallViewport();
        }
    }
    
    /**
     * Update layout for orientation
     */
    updateLayoutForOrientation() {
        const isLandscape = window.innerWidth > window.innerHeight;
        document.body.classList.toggle('landscape', isLandscape);
        document.body.classList.toggle('portrait', !isLandscape);
    }
    
    /**
     * Update responsive layout
     */
    updateResponsiveLayout() {
        const width = window.innerWidth;
        
        document.body.classList.toggle('mobile', width < 768);
        document.body.classList.toggle('tablet', width >= 768 && width < 1024);
        document.body.classList.toggle('desktop', width >= 1024);
    }
    
    /**
     * Optimize for small viewports
     */
    optimizeForSmallViewport() {
        document.body.classList.add('small-viewport');
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        if (this.performanceMonitor) {
            return this.performanceMonitor.getMetrics();
        }
        return null;
    }
    
    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        if (this.performanceMonitor) {
            return this.performanceMonitor.getPerformanceSummary();
        }
        return null;
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Make app globally accessible for testing
    window.GTWApp = GTWApp;
    window.gtw = new GTWApp();
    
    const success = await window.gtw.init();
    if (!success) {
        console.error('CRITICAL SYSTEM FAILURE');
    }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GTWApp };
}

// Make GTWApp globally available for browser console debugging
// Other classes are already global via their individual modules
if (typeof window !== 'undefined') {
    window.GTWApp = GTWApp;
    
    // Mark as loaded to prevent redeclaration
    window.GTWLoaded = true;
}

} // End of GTWLoaded check