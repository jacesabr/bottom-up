/**
 * Missile Launch System for Global Thermonuclear War
 * Handles missile launches, trajectory calculations, and animations
 */

class MissileSystem {
    constructor() {
        // Player configuration
        this.playerFaction = null;
        this.selectedLaunchSite = null;
        this.selectedTarget = null;
        
        // Active missiles tracking
        this.activeMissiles = new Map();
        this.missileIdCounter = 1;
        
        // Launch capabilities by asset type
        this.launchCapabilities = {
            submarine: ['SLBM', 'Cruise'],
            militaryBase: ['ICBM', 'IRBM'],
            carrier: ['Cruise'],
            silo: ['ICBM']
        };
        
        // Missile specifications
        this.missileSpecs = {
            SLBM: {
                name: 'Submarine-Launched Ballistic Missile',
                range: 8000, // km (global range)
                speed: 7000, // m/s
                yield: 475, // kilotons
                cooldown: 60, // seconds
                accuracy: 0.95
            },
            ICBM: {
                name: 'Intercontinental Ballistic Missile',
                range: 12000, // km (global range)
                speed: 8000, // m/s
                yield: 550, // kilotons
                cooldown: 120, // seconds
                accuracy: 0.98
            },
            IRBM: {
                name: 'Intermediate-Range Ballistic Missile',
                range: 5000, // km
                speed: 6000, // m/s
                yield: 300, // kilotons
                cooldown: 45, // seconds
                accuracy: 0.92
            },
            Cruise: {
                name: 'Cruise Missile',
                range: 2500, // km
                speed: 250, // m/s (subsonic)
                yield: 200, // kilotons
                cooldown: 30, // seconds
                accuracy: 0.99
            }
        };
        
        // Launch cooldowns tracking
        this.launchCooldowns = new Map();
        
        // Event callbacks
        this.launchCallbacks = [];
        this.animationCallbacks = [];
        this.impactCallbacks = [];
        
        // Trajectory calculator
        this.trajectoryCalculator = new TrajectoryCalculator();
    }

    /**
     * Set player faction
     */
    setPlayerFaction(faction) {
        this.playerFaction = faction;
        console.log(`Missile system configured for faction: ${faction}`);
    }

    /**
     * Select launch site
     */
    selectLaunchSite(asset) {
        if (!asset) {
            console.warn('Invalid launch site: null asset');
            return false;
        }

        if (asset.faction !== this.playerFaction) {
            console.warn(`Cannot select enemy launch site: ${asset.id}`);
            return false;
        }

        if (!this.canLaunchFrom(asset)) {
            console.warn(`Asset cannot launch missiles: ${asset.id}`);
            return false;
        }

        this.selectedLaunchSite = asset;
        console.log(`Launch site selected: ${asset.name || asset.id}`);
        return true;
    }

    /**
     * Select target
     */
    selectTarget(asset) {
        if (!asset) {
            console.warn('Invalid target: null asset');
            return false;
        }

        if (asset.faction === this.playerFaction) {
            console.warn('Cannot target own assets');
            return false;
        }

        this.selectedTarget = asset;
        console.log(`Target selected: ${asset.name || asset.id}`);
        return true;
    }

    /**
     * Check if asset can launch missiles
     */
    canLaunchFrom(asset) {
        if (!asset) return false;

        // Check if asset type supports launches
        const capabilities = this.launchCapabilities[asset.type] || asset.capabilities || [];
        if (capabilities.length === 0) return false;

        // Check cooldown
        const cooldown = this.getLaunchCooldown(asset);
        if (cooldown > 0) return false;

        return true;
    }

    /**
     * Check if launch is possible
     */
    canLaunch() {
        if (!this.selectedLaunchSite || !this.selectedTarget) {
            return false;
        }

        if (!this.canLaunchFrom(this.selectedLaunchSite)) {
            return false;
        }

        if (this.selectedTarget.faction === this.playerFaction) {
            return false;
        }

        return true;
    }

    /**
     * Launch missile
     */
    launchMissile(missileType = null) {
        if (!this.canLaunch()) {
            throw new Error('Cannot launch missile: invalid launch conditions');
        }

        // Determine missile type if not specified
        if (!missileType) {
            const availableTypes = this.getMissileTypes(this.selectedLaunchSite);
            missileType = availableTypes[0]; // Use first available type
        }

        const missileId = `missile_${this.missileIdCounter++}`;
        const launchTime = performance.now();
        
        // Calculate trajectory
        const trajectory = this.trajectoryCalculator.calculateTrajectory(
            this.selectedLaunchSite.coordinates,
            this.selectedTarget.coordinates,
            missileType
        );

        // Create missile object
        const missile = {
            id: missileId,
            type: missileType,
            launchSite: this.selectedLaunchSite,
            target: this.selectedTarget,
            trajectory: trajectory,
            launchTime: launchTime,
            status: 'in-flight',
            currentPosition: { ...this.selectedLaunchSite.coordinates }
        };

        // Track active missile
        this.activeMissiles.set(missileId, missile);

        // Record launch for cooldown
        this.recordLaunch(this.selectedLaunchSite);

        // Start animation
        this.startMissileAnimation(missile);

        // Emit launch event
        const launchEvent = {
            missileId: missileId,
            launchSite: this.selectedLaunchSite,
            target: this.selectedTarget,
            trajectory: trajectory,
            timestamp: Date.now()
        };

        this.launchCallbacks.forEach(callback => {
            try {
                callback(launchEvent);
            } catch (error) {
                console.error('Error in launch callback:', error);
            }
        });

        console.log(`Missile launched: ${missileId} from ${this.selectedLaunchSite.name} to ${this.selectedTarget.name}`);

        return {
            success: true,
            missileId: missileId,
            trajectory: trajectory,
            estimatedImpact: launchTime + trajectory.travelTime
        };
    }

    /**
     * Start missile animation
     */
    startMissileAnimation(missile) {
        const startTime = performance.now();
        const trajectory = missile.trajectory;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / trajectory.travelTime, 1);

            // Calculate current position along trajectory
            const pathIndex = Math.floor(progress * (trajectory.path.length - 1));
            const nextIndex = Math.min(pathIndex + 1, trajectory.path.length - 1);
            const segmentProgress = (progress * (trajectory.path.length - 1)) - pathIndex;

            const currentPoint = trajectory.path[pathIndex];
            const nextPoint = trajectory.path[nextIndex];

            missile.currentPosition = {
                x: currentPoint.x + (nextPoint.x - currentPoint.x) * segmentProgress,
                y: currentPoint.y + (nextPoint.y - currentPoint.y) * segmentProgress
            };

            // Emit animation event
            const animationEvent = {
                missileId: missile.id,
                position: missile.currentPosition,
                progress: progress,
                trajectory: trajectory
            };

            this.animationCallbacks.forEach(callback => {
                try {
                    callback(animationEvent);
                } catch (error) {
                    console.error('Error in animation callback:', error);
                }
            });

            // Continue animation or handle impact
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.handleMissileImpact(missile);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Handle missile impact
     */
    handleMissileImpact(missile) {
        missile.status = 'impacted';
        missile.impactTime = performance.now();

        // Remove from active missiles
        this.activeMissiles.delete(missile.id);

        // Emit impact event
        const impactEvent = {
            missileId: missile.id,
            target: missile.target,
            impactPosition: missile.target.coordinates,
            yield: this.missileSpecs[missile.type].yield,
            timestamp: Date.now()
        };

        this.impactCallbacks.forEach(callback => {
            try {
                callback(impactEvent);
            } catch (error) {
                console.error('Error in impact callback:', error);
            }
        });

        console.log(`Missile impact: ${missile.id} hit ${missile.target.name}`);
    }

    /**
     * Get missile types available for launch site
     */
    getMissileTypes(launchSite) {
        const assetCapabilities = this.launchCapabilities[launchSite.type] || launchSite.capabilities || [];
        return assetCapabilities.filter(type => this.missileSpecs[type]);
    }

    /**
     * Check if target is in range
     */
    isTargetInRange(launchSite, target, missileType = 'ICBM') {
        const distance = this.trajectoryCalculator.calculateDistance(
            launchSite.coordinates,
            target.coordinates
        );
        
        const maxRange = this.missileSpecs[missileType].range;
        return distance <= maxRange;
    }

    /**
     * Get launch cooldown for asset
     */
    getLaunchCooldown(asset) {
        const lastLaunch = this.launchCooldowns.get(asset.id);
        if (!lastLaunch) return 0;

        const elapsed = (Date.now() - lastLaunch.timestamp) / 1000;
        const cooldownTime = this.missileSpecs[lastLaunch.missileType]?.cooldown || 60;
        
        return Math.max(0, cooldownTime - elapsed);
    }

    /**
     * Record launch for cooldown tracking
     */
    recordLaunch(launchSite, missileType = 'ICBM') {
        this.launchCooldowns.set(launchSite.id, {
            timestamp: Date.now(),
            missileType: missileType
        });
    }

    /**
     * Get selected launch site
     */
    getSelectedLaunchSite() {
        return this.selectedLaunchSite;
    }

    /**
     * Get selected target
     */
    getSelectedTarget() {
        return this.selectedTarget;
    }

    /**
     * Get missile status
     */
    getMissileStatus(missileId) {
        return this.activeMissiles.get(missileId) || null;
    }

    /**
     * Get active missiles
     */
    getActiveMissiles() {
        return Array.from(this.activeMissiles.values());
    }

    /**
     * Clear selections
     */
    clearSelections() {
        this.selectedLaunchSite = null;
        this.selectedTarget = null;
    }

    /**
     * Register launch callback
     */
    onLaunch(callback) {
        if (typeof callback === 'function') {
            this.launchCallbacks.push(callback);
        }
    }

    /**
     * Register animation callback
     */
    onMissileAnimation(callback) {
        if (typeof callback === 'function') {
            this.animationCallbacks.push(callback);
        }
    }

    /**
     * Register impact callback
     */
    onImpact(callback) {
        if (typeof callback === 'function') {
            this.impactCallbacks.push(callback);
        }
    }

    /**
     * Reset missile system
     */
    reset() {
        this.clearSelections();
        this.activeMissiles.clear();
        this.launchCooldowns.clear();
        this.missileIdCounter = 1;
        console.log('Missile system reset');
    }
}

/**
 * Trajectory Calculator for missile paths
 */
class TrajectoryCalculator {
    constructor() {
        // Earth parameters for trajectory calculation
        this.earthRadius = 6371; // km
        this.mapWidth = 100; // Map coordinate system width
        this.mapHeight = 100; // Map coordinate system height
    }

    /**
     * Calculate missile trajectory
     */
    calculateTrajectory(launch, target, missileType = 'ICBM') {
        const distance = this.calculateDistance(launch, target);
        const path = this.calculatePath(launch, target, missileType);
        const travelTime = this.calculateTravelTime(distance, missileType);

        return {
            path: path,
            distance: distance,
            travelTime: travelTime,
            missileType: missileType,
            apogee: this.calculateApogee(distance, missileType)
        };
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
     * Calculate missile path
     */
    calculatePath(launch, target, missileType) {
        const steps = 20; // Number of path points
        const path = [];
        
        // For ballistic missiles, create an arc
        if (missileType === 'ICBM' || missileType === 'SLBM' || missileType === 'IRBM') {
            const distance = this.calculateDistance(launch, target);
            const maxHeight = this.calculateApogee(distance, missileType);
            
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                
                // Linear interpolation for x
                const x = launch.x + (target.x - launch.x) * t;
                
                // Parabolic arc for y with height adjustment
                const baseY = launch.y + (target.y - launch.y) * t;
                const arcHeight = maxHeight * Math.sin(Math.PI * t);
                const y = baseY - arcHeight; // Subtract because y increases downward
                
                path.push({ x, y });
            }
        } else {
            // For cruise missiles, use a more direct path with slight arc
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                
                const x = launch.x + (target.x - launch.x) * t;
                const y = launch.y + (target.y - launch.y) * t;
                
                // Add slight terrain-following variation
                const variation = Math.sin(t * Math.PI * 3) * 0.5;
                
                path.push({ x, y: y + variation });
            }
        }

        return path;
    }

    /**
     * Calculate travel time
     */
    calculateTravelTime(distance, missileType) {
        // Base travel time calculation (simplified)
        const missileSpecs = {
            ICBM: { baseTime: 25, speedFactor: 1.0 },
            SLBM: { baseTime: 20, speedFactor: 1.1 },
            IRBM: { baseTime: 15, speedFactor: 1.2 },
            Cruise: { baseTime: 45, speedFactor: 0.6 }
        };

        const specs = missileSpecs[missileType] || missileSpecs.ICBM;
        const timePerUnit = specs.baseTime / 100; // Base time for max distance
        
        return (distance * timePerUnit * specs.speedFactor) * 1000; // Convert to milliseconds
    }

    /**
     * Calculate missile apogee (highest point)
     */
    calculateApogee(distance, missileType) {
        const apogeeFactors = {
            ICBM: 0.15, // Higher arc
            SLBM: 0.12,
            IRBM: 0.10,
            Cruise: 0.02 // Very low altitude
        };

        const factor = apogeeFactors[missileType] || 0.10;
        return distance * factor;
    }

    /**
     * Calculate missile speed at point
     */
    calculateSpeedAtPoint(trajectory, progress) {
        const specs = {
            ICBM: 8000,
            SLBM: 7000,
            IRBM: 6000,
            Cruise: 250
        };

        const baseSpeed = specs[trajectory.missileType] || 7000;
        
        // Speed varies during flight (acceleration/deceleration)
        if (progress < 0.3) {
            // Acceleration phase
            return baseSpeed * (0.3 + progress * 2.3);
        } else if (progress > 0.8) {
            // Terminal phase (re-entry acceleration for ballistic)
            const terminalFactor = trajectory.missileType.includes('Cruise') ? 1 : 1.5;
            return baseSpeed * terminalFactor;
        } else {
            // Cruise phase
            return baseSpeed;
        }
    }

    /**
     * Get trajectory metadata
     */
    getTrajectoryMetadata(trajectory) {
        return {
            totalDistance: trajectory.distance,
            estimatedTravelTime: trajectory.travelTime,
            maxAltitude: trajectory.apogee,
            pathPoints: trajectory.path.length,
            missileType: trajectory.missileType
        };
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MissileSystem, TrajectoryCalculator };
} else if (typeof window !== 'undefined') {
    window.MissileSystem = MissileSystem;
    window.TrajectoryCalculator = TrajectoryCalculator;
}