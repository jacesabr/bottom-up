/**
 * Impact System for Global Thermonuclear War
 * Handles nuclear impact effects, casualties, and destruction mechanics
 */

class ImpactSystem {
    constructor() {
        // Impact tracking
        this.activeImpacts = new Map();
        this.radiationZones = new Map();
        this.destroyedTargets = new Set();
        
        // Casualty calculation parameters
        this.casualtyFactors = {
            city: {
                immediate: 0.6,    // 60% immediate casualties for direct hit
                radiation: 0.25,   // 25% radiation casualties
                burns: 0.15,       // 15% burn casualties
                infrastructureLoss: 0.8
            },
            militaryBase: {
                immediate: 0.4,    // 40% immediate (hardened facilities)
                radiation: 0.15,   // 15% radiation casualties
                burns: 0.1,        // 10% burn casualties
                infrastructureLoss: 0.6
            },
            submarine: {
                immediate: 0.95,   // 95% immediate (contained environment)
                radiation: 0.03,   // 3% radiation (most die immediately)
                burns: 0.02,       // 2% burns
                infrastructureLoss: 1.0
            }
        };
        
        // Damage radius calculations (in map units)
        this.damageRadii = {
            total: (yieldKt) => Math.sqrt(yieldKt / 10) * 3,     // Total destruction radius
            heavy: (yieldKt) => Math.sqrt(yieldKt / 20) * 3,     // Heavy damage radius
            moderate: (yieldKt) => Math.sqrt(yieldKt / 20) * 5,  // Moderate damage radius
            light: (yieldKt) => Math.sqrt(yieldKt / 20) * 8,     // Light damage radius
            radiation: (yieldKt) => Math.sqrt(yieldKt / 20) * 12 // Radiation contamination radius
        };
        
        // Event callbacks
        this.impactCallbacks = [];
        this.explosionCallbacks = [];
        this.statusUpdateCallbacks = [];
        this.trajectoryCleanupCallbacks = [];
        this.blastWaveCallbacks = [];
        
        // Visual effects management
        this.activeEffects = new Map();
        this.effectIdCounter = 1;
        
        // Infrastructure systems
        this.infrastructureTypes = ['power', 'water', 'communications', 'transportation'];
    }

    /**
     * Process nuclear impact event
     */
    processImpact(impactEvent) {
        const target = impactEvent.target;
        const yield_kt = impactEvent.yield;
        const impactPosition = impactEvent.impactPosition;
        
        // Calculate damage and casualties
        const damage = this.calculateDamage(target, yield_kt);
        const casualties = this.calculateCasualties(target, yield_kt, impactPosition);
        const damageRadius = this.calculateDamageRadius(yield_kt);
        
        // Create radiation zone
        const radiationZone = this.createRadiationZone({
            center: impactPosition,
            radius: this.damageRadii.radiation(yield_kt),
            intensity: Math.min(yield_kt / 1000, 1.0),
            halfLife: 30 // days
        });
        
        // Process target destruction
        const targetDestroyed = this.processTargetDestruction(target, damage);
        
        // Calculate infrastructure damage
        const infrastructureDamage = this.calculateInfrastructureDamage(
            target.infrastructure || {},
            yield_kt,
            impactPosition
        );
        
        // Store impact data
        const impactResult = {
            impactDetected: true,
            missileId: impactEvent.missileId,
            target: target,
            targetDestroyed: targetDestroyed,
            casualties: casualties.total,
            casualtyBreakdown: casualties,
            damage: damage,
            damageRadius: damageRadius,
            radiationZone: radiationZone,
            infrastructureDamage: infrastructureDamage,
            timestamp: impactEvent.timestamp
        };
        
        this.activeImpacts.set(impactEvent.missileId, impactResult);
        
        // Trigger visual effects
        this.triggerExplosionEffect({
            position: impactPosition,
            yield: yield_kt,
            type: 'nuclear'
        });
        
        // Update status and emit events
        this.updateCasualties({
            faction: target.faction,
            immediate: casualties.immediate,
            radiation: casualties.radiation,
            burns: casualties.burns,
            total: casualties.total
        });
        
        this.emitImpactEvent(impactResult);
        
        console.log(`Nuclear impact processed: ${target.name}, ${casualties.total} casualties`);
        return impactResult;
    }

    /**
     * Calculate damage to target
     */
    calculateDamage(target, yield_kt) {
        const targetType = target.type;
        const baseFactors = this.casualtyFactors[targetType] || this.casualtyFactors.city;
        
        // Calculate different damage types
        const primaryDamage = yield_kt * 10 * baseFactors.immediate;
        const radiationDamage = yield_kt * 5 * baseFactors.radiation;
        const structuralDamage = yield_kt * 8 * baseFactors.infrastructureLoss;
        
        // Apply target-specific modifiers
        let hardeningFactor = 1.0;
        if (target.hardening) {
            switch (target.hardening) {
                case 'high': hardeningFactor = 0.2; break;
                case 'medium': hardeningFactor = 0.5; break;
                case 'low': hardeningFactor = 0.8; break;
            }
        }
        
        return {
            primaryDamage: Math.floor(primaryDamage * hardeningFactor),
            radiationDamage: Math.floor(radiationDamage),
            structuralDamage: Math.floor(structuralDamage * hardeningFactor),
            totalDamage: Math.floor((primaryDamage + radiationDamage + structuralDamage) * hardeningFactor),
            hardeningFactor: hardeningFactor
        };
    }

    /**
     * Calculate casualties from nuclear impact
     */
    calculateCasualties(target, yield_kt, impactPosition) {
        const targetType = target.type;
        const baseFactors = this.casualtyFactors[targetType] || this.casualtyFactors.city;
        
        // Get population or personnel count
        const population = target.population || target.personnel || 100000;
        
        // Calculate distance factor (if impact is not at target center)
        const distance = this.calculateDistance(target.coordinates, impactPosition);
        const distanceFactor = Math.max(0.1, 1 - (distance / 20)); // Reduce casualties with distance
        
        // Apply hardening factor to casualty calculations
        let hardeningReduction = 1.0;
        if (target.hardening) {
            hardeningReduction = target.hardening === 'high' ? 0.3 : (target.hardening === 'medium' ? 0.6 : 0.9);
        }

        // Calculate different casualty types
        const immediate = Math.floor(population * baseFactors.immediate * distanceFactor * hardeningReduction);
        const radiation = Math.floor(population * baseFactors.radiation * distanceFactor * 0.8 * hardeningReduction);
        const burns = Math.floor(population * baseFactors.burns * distanceFactor * hardeningReduction);
        
        return {
            immediate: immediate,
            radiation: radiation,
            burns: burns,
            total: immediate + radiation,
            distanceFactor: distanceFactor,
            survivabilityFactor: target.hardening === 'high' ? 0.7 : (target.hardening === 'medium' ? 0.5 : 0.3)
        };
    }

    /**
     * Calculate urban-specific casualties
     */
    calculateUrbanCasualties(urbanArea, yield_kt, groundZero, distance) {
        const densityMultiplier = {
            'high': 1.2,
            'medium': 1.0,
            'low': 0.7
        }[urbanArea.density] || 1.0;
        
        const distanceFactor = Math.max(0.05, 1 - (distance / 25));
        const population = urbanArea.population * densityMultiplier;
        
        const immediate = Math.floor(population * 0.7 * distanceFactor);
        const radiation = Math.floor(population * 0.2 * distanceFactor * 0.9);
        const burns = Math.floor(population * 0.3 * distanceFactor);
        
        return {
            immediate: immediate,
            radiation: radiation,
            burns: burns,
            total: immediate + radiation + burns
        };
    }

    /**
     * Calculate damage radius
     */
    calculateDamageRadius(yield_kt) {
        return this.damageRadii.total(yield_kt);
    }

    /**
     * Create radiation zone
     */
    createRadiationZone(zoneData) {
        const zoneId = `radiation_${Date.now()}`;
        const radiationZone = {
            id: zoneId,
            center: zoneData.center,
            radius: zoneData.radius,
            intensity: zoneData.intensity,
            halfLife: zoneData.halfLife,
            createdAt: Date.now(),
            lastUpdate: Date.now()
        };
        
        this.radiationZones.set(zoneId, radiationZone);
        return radiationZone;
    }

    /**
     * Update radiation zones (decay over time)
     */
    updateRadiationZones(daysPassed) {
        this.radiationZones.forEach((zone, zoneId) => {
            const halfLives = daysPassed / zone.halfLife;
            zone.intensity = zone.intensity * Math.pow(0.5, halfLives);
            zone.lastUpdate = Date.now();
            
            // Remove zones with very low intensity
            if (zone.intensity < 0.01) {
                this.radiationZones.delete(zoneId);
            }
        });
    }

    /**
     * Get active radiation zones
     */
    getActiveRadiationZones() {
        return Array.from(this.radiationZones.values());
    }

    /**
     * Process target destruction
     */
    processTargetDestruction(target, damage) {
        // For testing purposes, always destroy large targets hit by nuclear weapons
        // A 550kt nuclear weapon hitting a major city should definitely destroy it
        const targetSize = target.population || target.personnel || 100000;
        
        // Simplified destruction logic - nuclear weapons destroy targets
        let isDestroyed = false;
        
        if (target.type === 'city' && damage.totalDamage > 10000) {
            // Any significant nuclear damage destroys a city
            isDestroyed = true;
        } else if (target.type === 'militaryBase' && damage.totalDamage > 5000) {
            // Military bases need substantial damage
            isDestroyed = true;
        } else if (damage.totalDamage > 1000) {
            // Other assets destroyed with moderate damage
            isDestroyed = true;
        }
        
        if (isDestroyed) {
            this.destroyedTargets.add(target.id);
            this.markTargetDestroyed(target);
        }
        
        return isDestroyed;
    }

    /**
     * Mark target as visually destroyed
     */
    markTargetDestroyed(target) {
        if (target.element) {
            target.element.classList.add('destroyed');
            target.element.setAttribute('opacity', '0.3');
            target.element.style.filter = 'grayscale(100%) brightness(0.5)';
        }
        
        console.log(`Target marked as destroyed: ${target.name}`);
    }

    /**
     * Calculate infrastructure damage
     */
    calculateInfrastructureDamage(infrastructure, yield_kt, impactPosition) {
        const damage = {};
        let totalDamagePercent = 0;
        
        this.infrastructureTypes.forEach(type => {
            if (infrastructure[type]) {
                const capacity = infrastructure[type].capacity || 1000;
                const damagePercent = Math.min(0.95, yield_kt / 1000 + Math.random() * 0.3);
                const damaged = Math.floor(capacity * damagePercent);
                
                damage[type] = {
                    capacity: capacity,
                    damaged: damaged,
                    remaining: capacity - damaged,
                    damagePercent: damagePercent
                };
                
                totalDamagePercent += damagePercent;
            }
        });
        
        damage.totalDamagePercent = totalDamagePercent / this.infrastructureTypes.length;
        return damage;
    }

    /**
     * Process multiple simultaneous impacts
     */
    processMultipleImpacts(impacts) {
        return impacts.map(impact => this.processImpact(impact));
    }

    /**
     * Calculate radiation effects
     */
    calculateRadiationEffects(exposure) {
        const dose = exposure.initialDose;
        
        return {
            acuteSyndrome: dose >= 150,
            mortalityRate: Math.min(0.98, dose / 1000),
            timeToOnset: Math.max(1, 48 - (dose / 50)),
            longTermEffects: dose > 50 ? ['cancer', 'genetic_damage'] : [],
            treatmentRequired: dose > 25
        };
    }

    /**
     * Calculate total population impact
     */
    calculateTotalPopulationImpact(targets) {
        const totalCasualties = targets.reduce((sum, target) => sum + target.casualties, 0);
        const totalPopulation = targets.reduce((sum, target) => sum + (target.population || target.personnel || 0), 0);
        
        return {
            totalCasualties: totalCasualties,
            populationLoss: totalPopulation > 0 ? totalCasualties / totalPopulation : 0,
            affectedAreas: targets.length,
            averageCasualtiesPerArea: Math.floor(totalCasualties / targets.length)
        };
    }

    /**
     * Trigger explosion visual effect
     */
    triggerExplosionEffect(impactData) {
        const maxRadius = this.calculateDamageRadius(impactData.yield);
        const duration = Math.max(2000, impactData.yield * 3); // Longer for bigger explosions
        
        const explosionEffect = {
            position: impactData.position,
            yield: impactData.yield,
            maxRadius: maxRadius,
            duration: duration,
            effects: ['fireball', 'shockwave', 'mushroom_cloud', 'radiation_flash']
        };
        
        this.explosionCallbacks.forEach(callback => {
            try {
                callback(explosionEffect);
            } catch (error) {
                console.error('Error in explosion callback:', error);
            }
        });
    }

    /**
     * Create damage radius effect
     */
    createDamageRadiusEffect(center, radius) {
        return {
            center: center,
            radius: radius,
            type: 'expanding-circle',
            duration: 3000,
            color: '#ff6600',
            opacity: 0.6
        };
    }

    /**
     * Create radiation zone visual
     */
    createRadiationZoneVisual(radiationZone) {
        return {
            type: 'radiation-zone',
            center: radiationZone.center,
            radius: radiationZone.radius,
            color: radiationZone.color || '#ff9900',
            opacity: radiationZone.intensity,
            pattern: 'crosshatch'
        };
    }

    /**
     * Clean up missile trajectory
     */
    cleanupMissileTrajectory(missileId) {
        this.trajectoryCleanupCallbacks.forEach(callback => {
            try {
                callback({
                    missileId: missileId,
                    action: 'remove_trajectory'
                });
            } catch (error) {
                console.error('Error in trajectory cleanup callback:', error);
            }
        });
    }

    /**
     * Trigger blast wave effect
     */
    triggerBlastWave(blastData) {
        this.blastWaveCallbacks.forEach(callback => {
            try {
                callback({
                    center: blastData.center,
                    currentRadius: 0,
                    maxRadius: blastData.maxRadius,
                    progress: 0,
                    speed: blastData.speed
                });
            } catch (error) {
                console.error('Error in blast wave callback:', error);
            }
        });
    }

    /**
     * Visual effects management
     */
    addVisualEffect(effect) {
        const effectId = `effect_${this.effectIdCounter++}`;
        this.activeEffects.set(effectId, effect);
        return effectId;
    }

    removeVisualEffect(effectId) {
        return this.activeEffects.delete(effectId);
    }

    getActiveEffects() {
        return Array.from(this.activeEffects.values());
    }

    /**
     * Update casualties in status systems
     */
    updateCasualties(casualties) {
        this.statusUpdateCallbacks.forEach(callback => {
            try {
                callback({
                    type: 'casualties',
                    faction: casualties.faction,
                    casualties: casualties.total,
                    breakdown: casualties
                });
            } catch (error) {
                console.error('Error in status update callback:', error);
            }
        });
    }

    /**
     * Emit impact event
     */
    emitImpactEvent(impactResult) {
        this.impactCallbacks.forEach(callback => {
            try {
                callback(impactResult);
            } catch (error) {
                console.error('Error in impact callback:', error);
            }
        });
    }

    /**
     * Calculate distance between two points
     */
    calculateDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Event listener registration
     */
    onImpact(callback) {
        if (typeof callback === 'function') {
            this.impactCallbacks.push(callback);
        }
    }

    onExplosionEffect(callback) {
        if (typeof callback === 'function') {
            this.explosionCallbacks.push(callback);
        }
    }

    onStatusUpdate(callback) {
        if (typeof callback === 'function') {
            this.statusUpdateCallbacks.push(callback);
        }
    }

    onTrajectoryCleanup(callback) {
        if (typeof callback === 'function') {
            this.trajectoryCleanupCallbacks.push(callback);
        }
    }

    onBlastWave(callback) {
        if (typeof callback === 'function') {
            this.blastWaveCallbacks.push(callback);
        }
    }

    /**
     * Reset impact system
     */
    reset() {
        this.activeImpacts.clear();
        this.radiationZones.clear();
        this.destroyedTargets.clear();
        this.activeEffects.clear();
        this.effectIdCounter = 1;
        console.log('Impact system reset');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImpactSystem };
} else if (typeof window !== 'undefined') {
    window.ImpactSystem = ImpactSystem;
}