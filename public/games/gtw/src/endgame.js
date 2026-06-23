/**
 * Endgame Detection System for Global Thermonuclear War
 * Detects mutual destruction and triggers appropriate endgame sequence
 */

class EndgameDetector {
    constructor() {
        // Endgame state
        this.isActive = false;
        this.gameState = 'READY';
        this.endgameReason = null;
        this.conflictStartTime = null;
        
        // Destruction thresholds for mutual destruction
        this.thresholds = {
            casualtyPercentage: 0.50,    // 50% population casualties
            assetDestruction: 0.70,      // 70% strategic assets destroyed
            infrastructureDestruction: 0.65, // 65% infrastructure destroyed
            combinedDestruction: 0.60    // 60% overall destruction
        };
        
        // Population data
        this.populations = {
            us: 300000000,    // ~300M US population (1983)
            ussr: 280000000   // ~280M USSR population (1983)
        };
        
        // Event callbacks
        this.endgameCallbacks = [];
        this.transitionCallbacks = [];
        
        console.log('Endgame Detection System initialized');
    }

    /**
     * Check if conditions for mutual destruction have been met
     */
    checkMutualDestruction(gameState) {
        const usDestruction = this.calculateDestructionLevel(gameState.us, 'us');
        const ussrDestruction = this.calculateDestructionLevel(gameState.ussr, 'ussr');
        
        // Lower threshold for mutual destruction detection
        const criticalThreshold = 0.55; // Slightly lower than 0.6 to catch edge cases
        const bothSidesCritical = (
            usDestruction.overall >= criticalThreshold &&
            ussrDestruction.overall >= criticalThreshold
        );
        
        const isMutualDestruction = bothSidesCritical;
        const destructionLevel = (usDestruction.overall + ussrDestruction.overall) / 2;
        
        // Check for asymmetric damage
        const asymmetricDamage = Math.abs(usDestruction.overall - ussrDestruction.overall) > 0.15;
        const moreAffectedSide = usDestruction.overall > ussrDestruction.overall ? 'us' : 'ussr';
        
        return {
            isMutualDestruction,
            bothSidesCritical,
            destructionLevel,
            usDestruction: usDestruction.overall,
            ussrDestruction: ussrDestruction.overall,
            asymmetricDamage,
            moreAffectedSide: asymmetricDamage ? moreAffectedSide : null
        };
    }

    /**
     * Calculate destruction level for a faction
     */
    calculateDestructionLevel(factionData, factionId) {
        const population = this.populations[factionId];
        
        // Calculate casualty percentage
        const casualtyPercentage = factionData.casualties / population;
        
        // Calculate asset destruction percentage
        const assetDestructionPercentage = factionData.assetsDestroyed / factionData.totalAssets;
        
        // Calculate overall destruction (weighted average)
        const overall = (
            casualtyPercentage * 0.6 +           // 60% weight on casualties
            assetDestructionPercentage * 0.4     // 40% weight on strategic assets
        );
        
        return {
            casualties: casualtyPercentage,
            assets: assetDestructionPercentage,
            overall: overall
        };
    }

    /**
     * Calculate final casualty statistics
     */
    calculateFinalCasualties(casualtyData) {
        const usCasualties = casualtyData.us.total;
        const ussrCasualties = casualtyData.ussr.total;
        const totalCasualties = usCasualties + ussrCasualties;
        
        const casualtyPercentage = {
            us: (usCasualties / this.populations.us) * 100,
            ussr: (ussrCasualties / this.populations.ussr) * 100
        };
        
        return {
            usCasualties,
            ussrCasualties,
            totalCasualties,
            globalCasualties: totalCasualties,
            casualtyPercentage,
            breakdown: {
                us: casualtyData.us,
                ussr: casualtyData.ussr
            }
        };
    }

    /**
     * Evaluate current game state for endgame conditions
     */
    evaluateGameState(gameState) {
        if (this.isActive) {
            return; // Endgame already triggered
        }
        
        const result = this.checkMutualDestruction(gameState);
        
        if (result.isMutualDestruction) {
            this.triggerEndgame('MUTUAL_DESTRUCTION', result);
        }
    }

    /**
     * Trigger endgame sequence
     */
    triggerEndgame(reason, destructionData = null) {
        this.isActive = true;
        this.gameState = 'ENDGAME';
        this.endgameReason = reason;
        
        console.log(`Endgame triggered: ${reason}`);
        
        // Emit endgame event
        this.endgameCallbacks.forEach(callback => {
            try {
                callback({
                    reason,
                    destructionData,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error in endgame callback:', error);
            }
        });
    }

    /**
     * Calculate game result for display
     */
    calculateGameResult(gameState) {
        const result = this.checkMutualDestruction(gameState);
        
        let message, futilityMessage;
        
        if (result.destructionLevel >= 0.8) {
            message = 'TOTAL MUTUAL ANNIHILATION';
            futilityMessage = 'Complete civilization collapse. The ultimate futility of nuclear warfare demonstrated.';
        } else if (result.destructionLevel >= 0.6) {
            message = 'MUTUAL DESTRUCTION ACHIEVED';
            futilityMessage = 'Both sides lie in ruins. The futility of nuclear war produces no winners, only devastation.';
        } else {
            message = 'MASSIVE MUTUAL CASUALTIES';
            futilityMessage = 'Heavy losses on both sides. The futility of nuclear conflict is clear.';
        }
        
        return {
            winner: 'NONE',
            outcome: 'DRAW',
            message,
            futilityMessage,
            destructionLevel: result.destructionLevel
        };
    }

    /**
     * Calculate infrastructure destruction levels
     */
    calculateInfrastructureDestruction(infrastructureData) {
        const calculateAverage = (data) => {
            const values = Object.values(data);
            return values.reduce((sum, val) => sum + val, 0) / values.length;
        };
        
        const usDestruction = calculateAverage(infrastructureData.us);
        const ussrDestruction = calculateAverage(infrastructureData.ussr);
        const overallDestruction = (usDestruction + ussrDestruction) / 2;
        
        const civilizationCollapse = overallDestruction >= 0.7;
        
        return {
            us: {
                averageDestruction: usDestruction,
                breakdown: infrastructureData.us
            },
            ussr: {
                averageDestruction: ussrDestruction,
                breakdown: infrastructureData.ussr
            },
            overallDestruction,
            civilizationCollapse
        };
    }

    /**
     * Evaluate nuclear winter conditions
     */
    evaluateNuclearWinter(explosionData) {
        // Calculate nuclear winter severity based on total megatonnage and targets
        const baselineSeverity = Math.min(1.0, explosionData.totalMegatonnage / 5000);
        const cityTargetModifier = explosionData.cityTargets * 0.02; // Cities create more debris
        const fireStormModifier = explosionData.fireStormsProbable * 0.015;
        
        const nuclearWinterSeverity = Math.min(1.0, 
            baselineSeverity + cityTargetModifier + fireStormModifier
        );
        
        let globalClimateImpact, globalFamineRisk;
        
        if (nuclearWinterSeverity >= 0.8) {
            globalClimateImpact = 'SEVERE';
            globalFamineRisk = 'EXTREME';
        } else if (nuclearWinterSeverity >= 0.6) {
            globalClimateImpact = 'MAJOR';
            globalFamineRisk = 'HIGH';
        } else {
            globalClimateImpact = 'MODERATE';
            globalFamineRisk = 'MODERATE';
        }
        
        const agricultureDestruction = Math.min(1.0, nuclearWinterSeverity * 1.2);
        
        return {
            nuclearWinterSeverity,
            globalClimateImpact,
            agricultureDestruction,
            globalFamineRisk
        };
    }

    /**
     * Calculate long-term survival projections
     */
    calculateSurvivalProjections(postWarConditions) {
        const baselineDeathRate = 0.15; // 15% additional deaths from baseline conditions
        
        // Year 1 additional deaths from radiation, disease, starvation
        const year1Modifier = (
            postWarConditions.radiationZones * 200000 +
            postWarConditions.infrastructureDestruction * 80000000 +
            postWarConditions.nuclearWinterSeverity * 100000000
        );
        
        const additionalDeathsYear1 = Math.min(200000000, year1Modifier);
        
        // Year 5 cumulative additional deaths
        const additionalDeathsYear5 = additionalDeathsYear1 * 2.5;
        
        // Recovery time estimates (years)
        const civilizationRecoveryTime = Math.max(25, 
            postWarConditions.infrastructureDestruction * 100 +
            postWarConditions.nuclearWinterSeverity * 50
        );
        
        const preWarPopulationRecovery = civilizationRecoveryTime * 2;
        
        return {
            additionalDeathsYear1,
            additionalDeathsYear5,
            civilizationRecoveryTime,
            preWarPopulationRecovery
        };
    }

    /**
     * Generate appropriate endgame message based on destruction level
     */
    generateEndgameMessage(destructionLevel) {
        let severity, message;
        
        if (destructionLevel >= 0.9) {
            severity = 'EXTREME';
            message = 'Complete annihilation achieved. Civilization has ended.';
        } else if (destructionLevel >= 0.7) {
            severity = 'SEVERE';
            message = 'Massive devastation across both superpowers.';
        } else {
            severity = 'HIGH';
            message = 'devastating losses demonstrate the futility of nuclear war.';
        }
        
        return { severity, message };
    }

    /**
     * Analyze escalation timeline
     */
    analyzeEscalationTimeline(events) {
        if (events.length === 0) return null;
        
        const firstEvent = events[0];
        const lastEvent = events[events.length - 1];
        const totalDuration = lastEvent.timestamp - firstEvent.timestamp;
        
        // Determine escalation speed
        let escalationSpeed;
        if (totalDuration < 60000) {
            escalationSpeed = 'RAPID';
        } else if (totalDuration < 300000) {
            escalationSpeed = 'MODERATE';
        } else {
            escalationSpeed = 'SLOW';
        }
        
        // Find point of no return (usually when DEFCON reaches 2)
        const criticalEvent = events.find(e => e.defcon === 2);
        const pointOfNoReturn = criticalEvent ? criticalEvent.timestamp - firstEvent.timestamp : Math.max(0, totalDuration - 1000);
        
        return {
            totalDuration,
            escalationSpeed,
            firstStrikeFaction: firstEvent.faction,
            pointOfNoReturn,
            eventCount: events.length
        };
    }

    /**
     * Mark start of conflict for timing calculations
     */
    markConflictStart(timestamp = Date.now()) {
        this.conflictStartTime = timestamp;
    }

    /**
     * Calculate time to destruction
     */
    calculateDestructionTime(endTime) {
        if (!this.conflictStartTime) {
            this.conflictStartTime = endTime - 120000; // Default 2 minutes
        }
        
        const conflictDuration = endTime - this.conflictStartTime;
        const minutes = Math.floor(conflictDuration / 60000);
        const seconds = Math.floor((conflictDuration % 60000) / 1000);
        
        const timeToDestruction = `${minutes} minutes ${seconds} seconds`;
        
        let escalationRate;
        if (conflictDuration < 180000) {
            escalationRate = 'CATASTROPHIC';
        } else if (conflictDuration < 600000) {
            escalationRate = 'RAPID';
        } else {
            escalationRate = 'MEASURED';
        }
        
        return {
            conflictDuration,
            timeToDestruction,
            escalationRate
        };
    }

    /**
     * Reset endgame detector
     */
    reset() {
        this.isActive = false;
        this.gameState = 'READY';
        this.endgameReason = null;
        this.conflictStartTime = null;
    }

    /**
     * State getters
     */
    isEndgameActive() {
        return this.isActive;
    }

    isGameplayAllowed() {
        return !this.isActive;
    }

    canRestart() {
        return this.isActive;
    }

    getGameState() {
        return this.gameState;
    }

    getEndgameReason() {
        return this.endgameReason;
    }

    /**
     * Event listener registration
     */
    onEndgameTriggered(callback) {
        if (typeof callback === 'function') {
            this.endgameCallbacks.push(callback);
        }
    }

    onTransition(callback) {
        if (typeof callback === 'function') {
            this.transitionCallbacks.push(callback);
        }
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EndgameDetector };
} else if (typeof window !== 'undefined') {
    window.EndgameDetector = EndgameDetector;
}