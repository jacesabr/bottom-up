/**
 * Missile Visualization System for Global Thermonuclear War
 * Handles visual rendering of missile trajectories and animations on the world map
 */

class MissileVisualization {
    constructor() {
        // SVG namespace
        this.svgNS = 'http://www.w3.org/2000/svg';
        
        // Visual configuration
        this.visualConfig = {
            trajectory: {
                strokeWidth: 2,
                strokeColor: '#ff6600',
                strokeOpacity: 0.8,
                dashArray: '5,3',
                glowEffect: true
            },
            missile: {
                size: 3,
                color: '#ffff00',
                trailLength: 8,
                trailOpacity: 0.6,
                glowRadius: 6
            },
            explosion: {
                maxRadius: 15,
                duration: 2000,
                colors: ['#ffff00', '#ff6600', '#ff0000'],
                shockwaveRadius: 25,
                shockwaveDuration: 1500
            },
            launch: {
                flashDuration: 500,
                flashColor: '#ffffff',
                smokeTrailLength: 10
            }
        };
        
        // Active visual elements
        this.activeTrajectories = new Map();
        this.activeMissiles = new Map();
        this.activeExplosions = new Map();
        
        // SVG container reference
        this.svgContainer = null;
        this.trajectoryGroup = null;
        this.missileGroup = null;
        this.effectsGroup = null;
        
        // Animation tracking
        this.animationFrameId = null;
        this.lastFrameTime = 0;
    }

    /**
     * Initialize visualization with SVG container
     */
    initialize(svgContainer) {
        if (!svgContainer) {
            console.error('MissileVisualization.initialize() called with null/undefined svgContainer');
            return;
        }
        
        this.svgContainer = svgContainer;
        this.createLayerGroups();
        console.log('Missile visualization initialized successfully with SVG container');
        console.log('SVG container dimensions:', svgContainer.getAttribute('viewBox'));
        console.log('Layer groups created:', {
            trajectoryGroup: !!this.trajectoryGroup,
            missileGroup: !!this.missileGroup,
            effectsGroup: !!this.effectsGroup
        });
    }

    /**
     * Create SVG layer groups for organization
     */
    createLayerGroups() {
        if (!this.svgContainer) return;

        // Create trajectory layer
        this.trajectoryGroup = document.createElementNS(this.svgNS, 'g');
        this.trajectoryGroup.setAttribute('class', 'missile-trajectories');
        this.svgContainer.appendChild(this.trajectoryGroup);

        // Create missile layer
        this.missileGroup = document.createElementNS(this.svgNS, 'g');
        this.missileGroup.setAttribute('class', 'active-missiles');
        this.svgContainer.appendChild(this.missileGroup);

        // Create effects layer
        this.effectsGroup = document.createElementNS(this.svgNS, 'g');
        this.effectsGroup.setAttribute('class', 'missile-effects');
        this.svgContainer.appendChild(this.effectsGroup);
    }

    /**
     * Add trajectory visualization
     */
    addTrajectory(missileId, trajectory, options = {}) {
        if (!this.trajectoryGroup) return;

        const pathElement = this.createTrajectoryPath(trajectory, options.color);
        pathElement.setAttribute('data-missile-id', missileId);
        
        // Start with zero stroke-dashoffset and animate it appearing
        const pathLength = pathElement.getTotalLength();
        pathElement.style.strokeDasharray = `${pathLength} ${pathLength}`;
        pathElement.style.strokeDashoffset = pathLength;
        
        this.trajectoryGroup.appendChild(pathElement);
        this.activeTrajectories.set(missileId, pathElement);

        // Animate trajectory appearing
        this.animateTrajectoryAppearance(pathElement, 1000); // 1 second to appear

        console.log(`Trajectory added for missile: ${missileId}`);
    }

    /**
     * Animate trajectory path appearing
     */
    animateTrajectoryAppearance(pathElement, duration) {
        const startTime = performance.now();
        const initialOffset = pathElement.getTotalLength();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentOffset = initialOffset * (1 - progress);
            pathElement.style.strokeDashoffset = currentOffset;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Create SVG path for trajectory
     */
    createTrajectoryPath(trajectory, customColor = null) {
        const pathElement = document.createElementNS(this.svgNS, 'path');
        const pathData = this.generatePathData(trajectory.path);
        
        // Use custom color if provided, otherwise use default
        const strokeColor = customColor || this.visualConfig.trajectory.strokeColor;
        
        pathElement.setAttribute('d', pathData);
        pathElement.setAttribute('stroke', strokeColor);
        pathElement.setAttribute('stroke-width', this.visualConfig.trajectory.strokeWidth);
        pathElement.setAttribute('stroke-opacity', this.visualConfig.trajectory.strokeOpacity);
        pathElement.setAttribute('stroke-dasharray', this.visualConfig.trajectory.dashArray);
        pathElement.setAttribute('fill', 'none');
        pathElement.setAttribute('class', 'missile-trajectory');

        // Add glow effect with color-matched shadow
        if (this.visualConfig.trajectory.glowEffect) {
            pathElement.style.filter = `drop-shadow(0 0 4px ${strokeColor})`;
        }

        return pathElement;
    }

    /**
     * Generate SVG path data from trajectory points
     */
    generatePathData(pathPoints) {
        if (pathPoints.length === 0) return '';

        let pathData = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
        
        for (let i = 1; i < pathPoints.length; i++) {
            pathData += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;
        }

        return pathData;
    }

    /**
     * Add missile visualization
     */
    addMissile(missileId, startPosition, options = {}) {
        if (!this.missileGroup) return;

        const missileElement = this.createMissileElement(missileId, startPosition, options.color);
        this.missileGroup.appendChild(missileElement);
        this.activeMissiles.set(missileId, {
            element: missileElement,
            trail: []
        });

        console.log(`Missile visualization added: ${missileId}`);
    }

    /**
     * Create visual missile element
     */
    createMissileElement(missileId, position, customColor = null) {
        const missileGroup = document.createElementNS(this.svgNS, 'g');
        missileGroup.setAttribute('class', 'missile');
        missileGroup.setAttribute('data-missile-id', missileId);

        // Use custom color if provided, otherwise use default
        const missileColor = customColor || this.visualConfig.missile.color;

        // Create missile body
        const missile = document.createElementNS(this.svgNS, 'circle');
        missile.setAttribute('cx', position.x);
        missile.setAttribute('cy', position.y);
        missile.setAttribute('r', this.visualConfig.missile.size);
        missile.setAttribute('fill', missileColor);
        missile.setAttribute('class', 'missile-body');
        missile.style.filter = `drop-shadow(0 0 ${this.visualConfig.missile.glowRadius}px ${missileColor})`;

        missileGroup.appendChild(missile);

        return missileGroup;
    }

    /**
     * Update missile position
     */
    updateMissilePosition(missileId, position, progress) {
        const missile = this.activeMissiles.get(missileId);
        if (!missile) return;

        const missileBody = missile.element.querySelector('.missile-body');
        if (missileBody) {
            missileBody.setAttribute('cx', position.x);
            missileBody.setAttribute('cy', position.y);
        }

        // Update trail
        missile.trail.push({ ...position });
        if (missile.trail.length > this.visualConfig.missile.trailLength) {
            missile.trail.shift();
        }

        this.updateMissileTrail(missileId, missile.trail);
    }

    /**
     * Update missile trail visualization
     */
    updateMissileTrail(missileId, trail) {
        const missile = this.activeMissiles.get(missileId);
        if (!missile || trail.length < 2) return;

        // Remove existing trail
        const existingTrail = missile.element.querySelector('.missile-trail');
        if (existingTrail) {
            missile.element.removeChild(existingTrail);
        }

        // Create new trail
        const trailPath = document.createElementNS(this.svgNS, 'path');
        const pathData = this.generatePathData(trail);
        
        trailPath.setAttribute('d', pathData);
        trailPath.setAttribute('stroke', this.visualConfig.missile.color);
        trailPath.setAttribute('stroke-width', 1.5);
        trailPath.setAttribute('stroke-opacity', this.visualConfig.missile.trailOpacity);
        trailPath.setAttribute('fill', 'none');
        trailPath.setAttribute('class', 'missile-trail');

        missile.element.insertBefore(trailPath, missile.element.firstChild);
    }

    /**
     * Show launch flash effect
     */
    showLaunchFlash(position) {
        if (!this.effectsGroup) return;

        const flash = document.createElementNS(this.svgNS, 'circle');
        flash.setAttribute('cx', position.x);
        flash.setAttribute('cy', position.y);
        flash.setAttribute('r', 8);
        flash.setAttribute('fill', this.visualConfig.launch.flashColor);
        flash.setAttribute('opacity', 1);
        flash.setAttribute('class', 'launch-flash');

        this.effectsGroup.appendChild(flash);

        // Animate flash
        const startTime = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = elapsed / this.visualConfig.launch.flashDuration;

            if (progress >= 1) {
                if (flash.parentNode) {
                    flash.parentNode.removeChild(flash);
                }
                return;
            }

            const opacity = 1 - progress;
            const radius = 8 + (progress * 12);
            
            flash.setAttribute('opacity', opacity);
            flash.setAttribute('r', radius);

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    /**
     * Show explosion effect
     */
    showExplosion(missileId, position, yield_kt = 550) {
        if (!this.effectsGroup) return;

        const explosionGroup = document.createElementNS(this.svgNS, 'g');
        explosionGroup.setAttribute('class', 'explosion');
        explosionGroup.setAttribute('data-missile-id', missileId);

        // Create dramatic initial flash
        this.createExplosionFlash(explosionGroup, position, yield_kt);

        // Create multiple explosion rings
        const rings = this.createExplosionRings(position, yield_kt);
        rings.forEach(ring => explosionGroup.appendChild(ring));

        // Create fireball core
        this.createFireballCore(explosionGroup, position, yield_kt);

        this.effectsGroup.appendChild(explosionGroup);
        this.activeExplosions.set(missileId, explosionGroup);

        // Animate explosion
        this.animateExplosion(missileId, position, yield_kt);

        console.log(`Nuclear explosion effect shown for missile: ${missileId}, yield: ${yield_kt}kt`);
    }

    /**
     * Create dramatic explosion flash
     */
    createExplosionFlash(explosionGroup, position, yield_kt) {
        const flash = document.createElementNS(this.svgNS, 'circle');
        flash.setAttribute('cx', position.x);
        flash.setAttribute('cy', position.y);
        flash.setAttribute('r', 0);
        flash.setAttribute('fill', '#ffffff');
        flash.setAttribute('opacity', 1);
        flash.setAttribute('class', 'explosion-flash');
        
        explosionGroup.appendChild(flash);
        
        // Animate initial flash
        const maxFlashRadius = Math.min(50, yield_kt / 20);
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / 200, 1); // 200ms flash
            
            if (progress >= 1) {
                if (flash.parentNode) {
                    flash.parentNode.removeChild(flash);
                }
                return;
            }
            
            const radius = maxFlashRadius * progress;
            const opacity = 1 - progress;
            
            flash.setAttribute('r', radius);
            flash.setAttribute('opacity', opacity);
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Create fireball core
     */
    createFireballCore(explosionGroup, position, yield_kt) {
        const fireball = document.createElementNS(this.svgNS, 'circle');
        fireball.setAttribute('cx', position.x);
        fireball.setAttribute('cy', position.y);
        fireball.setAttribute('r', 0);
        fireball.setAttribute('fill', '#ff4400');
        fireball.setAttribute('opacity', 0.9);
        fireball.setAttribute('class', 'fireball-core');
        fireball.style.filter = 'drop-shadow(0 0 15px #ff4400)';
        
        explosionGroup.appendChild(fireball);
    }

    /**
     * Create explosion ring elements
     */
    createExplosionRings(position, yield_kt) {
        const rings = [];
        const colors = this.visualConfig.explosion.colors;
        const baseRadius = Math.min(this.visualConfig.explosion.maxRadius, yield_kt / 40);

        for (let i = 0; i < colors.length; i++) {
            const ring = document.createElementNS(this.svgNS, 'circle');
            ring.setAttribute('cx', position.x);
            ring.setAttribute('cy', position.y);
            ring.setAttribute('r', 0);
            ring.setAttribute('fill', colors[i]);
            ring.setAttribute('opacity', 0.8 - (i * 0.2));
            ring.setAttribute('class', `explosion-ring ring-${i}`);
            rings.push(ring);
        }

        return rings;
    }

    /**
     * Animate explosion effect
     */
    animateExplosion(missileId, position, yield_kt) {
        const explosionGroup = this.activeExplosions.get(missileId);
        if (!explosionGroup) return;

        const startTime = performance.now();
        const duration = this.visualConfig.explosion.duration;
        const maxRadius = Math.min(this.visualConfig.explosion.maxRadius, yield_kt / 40);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                if (explosionGroup.parentNode) {
                    explosionGroup.parentNode.removeChild(explosionGroup);
                }
                this.activeExplosions.delete(missileId);
                return;
            }

            // Update ring sizes and opacity
            const rings = explosionGroup.querySelectorAll('.explosion-ring');
            rings.forEach((ring, index) => {
                const ringProgress = Math.max(0, progress - (index * 0.1));
                const radius = maxRadius * ringProgress;
                const opacity = (0.8 - (index * 0.2)) * (1 - ringProgress);
                
                ring.setAttribute('r', radius);
                ring.setAttribute('opacity', Math.max(0, opacity));
            });

            // Update fireball core
            const fireball = explosionGroup.querySelector('.fireball-core');
            if (fireball) {
                const fireballProgress = Math.min(progress * 2, 1); // Fireball expands faster
                const fireballRadius = (maxRadius * 0.6) * fireballProgress;
                const fireballOpacity = Math.max(0, 0.9 * (1 - progress));
                
                fireball.setAttribute('r', fireballRadius);
                fireball.setAttribute('opacity', fireballOpacity);
                
                // Change color as it cools
                const heatLevel = 1 - progress;
                if (heatLevel > 0.7) {
                    fireball.setAttribute('fill', '#ffffff'); // White hot
                } else if (heatLevel > 0.4) {
                    fireball.setAttribute('fill', '#ffff00'); // Yellow
                } else if (heatLevel > 0.2) {
                    fireball.setAttribute('fill', '#ff6600'); // Orange
                } else {
                    fireball.setAttribute('fill', '#ff0000'); // Red
                }
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);

        // Add shockwave effect
        setTimeout(() => {
            this.showShockwave(position, yield_kt);
        }, 300);
    }

    /**
     * Show shockwave effect
     */
    showShockwave(position, yield_kt) {
        if (!this.effectsGroup) return;

        const shockwave = document.createElementNS(this.svgNS, 'circle');
        shockwave.setAttribute('cx', position.x);
        shockwave.setAttribute('cy', position.y);
        shockwave.setAttribute('r', 0);
        shockwave.setAttribute('stroke', '#ffffff');
        shockwave.setAttribute('stroke-width', 2);
        shockwave.setAttribute('stroke-opacity', 0.6);
        shockwave.setAttribute('fill', 'none');
        shockwave.setAttribute('class', 'shockwave');

        this.effectsGroup.appendChild(shockwave);

        const startTime = performance.now();
        const duration = this.visualConfig.explosion.shockwaveDuration;
        const maxRadius = this.visualConfig.explosion.shockwaveRadius;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                if (shockwave.parentNode) {
                    shockwave.parentNode.removeChild(shockwave);
                }
                return;
            }

            const radius = maxRadius * progress;
            const opacity = 0.6 * (1 - progress);
            
            shockwave.setAttribute('r', radius);
            shockwave.setAttribute('stroke-opacity', opacity);

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    /**
     * Remove missile visualization
     */
    removeMissile(missileId) {
        const missile = this.activeMissiles.get(missileId);
        if (missile && missile.element.parentNode) {
            missile.element.parentNode.removeChild(missile.element);
        }
        this.activeMissiles.delete(missileId);
    }

    /**
     * Remove trajectory visualization
     */
    removeTrajectory(missileId) {
        const trajectory = this.activeTrajectories.get(missileId);
        if (trajectory && trajectory.parentNode) {
            trajectory.parentNode.removeChild(trajectory);
        }
        this.activeTrajectories.delete(missileId);
    }

    /**
     * Clear all visualizations
     */
    clearAll() {
        if (this.trajectoryGroup) {
            this.trajectoryGroup.innerHTML = '';
        }
        if (this.missileGroup) {
            this.missileGroup.innerHTML = '';
        }
        if (this.effectsGroup) {
            this.effectsGroup.innerHTML = '';
        }

        this.activeTrajectories.clear();
        this.activeMissiles.clear();
        this.activeExplosions.clear();

        console.log('All missile visualizations cleared');
    }

    /**
     * High-level missile launch visualization
     */
    showLaunch(sourceCoords, targetCoords, options = {}) {
        if (!this.svgContainer) {
            console.warn('MissileVisualization not initialized - cannot show launch');
            return null;
        }
        
        const missileId = `missile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`Starting missile launch animation: ${missileId}`);
        console.log(`Source: ${sourceCoords.lat}, ${sourceCoords.lng}`);
        console.log(`Target: ${targetCoords.lat}, ${targetCoords.lng}`);
        
        // Convert lat/lng to SVG coordinates
        const sourcePoint = this.latLngToSVG(sourceCoords.lat, sourceCoords.lng);
        const targetPoint = this.latLngToSVG(targetCoords.lat, targetCoords.lng);
        
        // Create trajectory path with arc
        const trajectory = this.createArcTrajectory(sourcePoint, targetPoint);
        
        // Show launch flash effect at source
        this.showLaunchFlash(sourcePoint);
        
        // Add trajectory visualization with build-up effect and custom color
        this.addTrajectory(missileId, trajectory, { color: options.color });
        
        // Add missile that will travel along the trajectory with custom color
        this.addMissile(missileId, sourcePoint, { color: options.color });
        
        // Animate missile along trajectory with automatic explosion at end
        this.animateMissileAlongPath(missileId, trajectory, {
            duration: options.duration || 3000,
            targetCoords: targetCoords,
            magnitude: options.magnitude || 'medium',
            onComplete: options.onComplete
        });
        
        console.log(`Missile launch animation started: ${missileId}`);
        return missileId;
    }

    /**
     * High-level nuclear impact visualization
     */
    showImpact(coords, magnitude = 'medium') {
        const missileId = `impact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const position = this.latLngToSVG(coords.lat, coords.lng);
        
        // Determine yield based on magnitude
        const yieldMap = {
            'small': 100,   // 100kt
            'medium': 550,  // 550kt 
            'large': 1000   // 1Mt
        };
        
        const yield_kt = yieldMap[magnitude] || 550;
        
        // Show explosion effect
        this.showExplosion(missileId, position, yield_kt);
        
        return missileId;
    }

    /**
     * Convert lat/lng coordinates to SVG viewport coordinates
     */
    latLngToSVG(lat, lng) {
        // Validate input coordinates
        if (typeof lat !== 'number' || typeof lng !== 'number' || 
            isNaN(lat) || isNaN(lng) || 
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.error(`Invalid lat/lng coordinates: lat=${lat}, lng=${lng}`);
            // Return center coordinates as fallback
            return { x: 500, y: 253.5 };
        }
        
        // Simple projection to SVG coordinates (1000x507 viewport)
        const x = ((lng + 180) / 360) * 1000;
        const y = ((90 - lat) / 180) * 507;
        
        const result = { 
            x: Math.max(0, Math.min(1000, x)), 
            y: Math.max(0, Math.min(507, y)) 
        };
        
        // Validate result
        if (isNaN(result.x) || isNaN(result.y)) {
            console.error(`Invalid coordinate conversion result: lat=${lat}, lng=${lng} -> x=${result.x}, y=${result.y}`);
            return { x: 500, y: 253.5 }; // Fallback to center
        }
        
        return result;
    }

    /**
     * Create arc trajectory between two points
     */
    createArcTrajectory(startPoint, endPoint) {
        // Validate input points
        if (!startPoint || !endPoint || 
            typeof startPoint.x !== 'number' || typeof startPoint.y !== 'number' ||
            typeof endPoint.x !== 'number' || typeof endPoint.y !== 'number' ||
            isNaN(startPoint.x) || isNaN(startPoint.y) || 
            isNaN(endPoint.x) || isNaN(endPoint.y)) {
            console.error('Invalid start or end points for trajectory:', { startPoint, endPoint });
            // Return fallback trajectory
            return { 
                path: [
                    { x: 500, y: 253.5 },
                    { x: 500, y: 253.5 }
                ]
            };
        }
        
        const path = [];
        const steps = 20;
        
        // Calculate arc height (higher for longer distances)
        const distance = Math.sqrt(
            Math.pow(endPoint.x - startPoint.x, 2) + 
            Math.pow(endPoint.y - startPoint.y, 2)
        );
        const arcHeight = Math.min(distance * 0.3, 100);
        
        // Create arc points
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            
            // Linear interpolation for x
            const x = startPoint.x + (endPoint.x - startPoint.x) * t;
            
            // Parabolic arc for y
            const linearY = startPoint.y + (endPoint.y - startPoint.y) * t;
            const arcY = linearY - (4 * arcHeight * t * (1 - t));
            
            // Validate calculated point
            if (isNaN(x) || isNaN(arcY)) {
                console.error(`Invalid trajectory point calculated at step ${i}:`, { x, y: arcY });
                continue; // Skip invalid points
            }
            
            path.push({ x, y: arcY });
        }
        
        // Ensure we have at least two points
        if (path.length < 2) {
            console.error('Trajectory generation failed, using fallback path');
            return { 
                path: [
                    { x: startPoint.x || 500, y: startPoint.y || 253.5 },
                    { x: endPoint.x || 500, y: endPoint.y || 253.5 }
                ]
            };
        }
        
        console.log(`Generated trajectory with ${path.length} points from (${startPoint.x},${startPoint.y}) to (${endPoint.x},${endPoint.y})`);
        return { path };
    }

    /**
     * Animate missile along trajectory path
     */
    animateMissileAlongPath(missileId, trajectory, options) {
        const missile = this.activeMissiles.get(missileId);
        if (!missile) {
            console.warn(`Cannot animate missile ${missileId} - missile not found`);
            return;
        }
        
        const duration = options.duration || 3000;
        const startTime = performance.now();
        const path = trajectory.path;
        
        // Validate path
        if (!path || !Array.isArray(path) || path.length === 0) {
            console.error(`Invalid trajectory path for missile ${missileId}:`, path);
            this.removeMissile(missileId);
            return;
        }
        
        // Additional validation - ensure minimum path length
        if (path.length < 2) {
            console.error(`Trajectory path too short for missile ${missileId}: ${path.length} points (minimum 2 required)`);
            this.removeMissile(missileId);
            return;
        }
        
        console.log(`Animating missile ${missileId} along path with ${path.length} points`);
        console.log(`First point:`, path[0]);
        console.log(`Last point:`, path[path.length - 1]);
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress >= 1) {
                // Remove missile at end of trajectory
                this.removeMissile(missileId);
                
                // Automatically trigger explosion at target
                if (options.targetCoords) {
                    setTimeout(() => {
                        this.showImpact(options.targetCoords, options.magnitude || 'medium');
                        if (options.onComplete) {
                            options.onComplete(missileId);
                        }
                    }, 100); // Small delay for visual effect
                }
                return;
            }
            
            // Calculate position along path with safety checks
            const pathIndex = progress * (path.length - 1);
            const floorIndex = Math.max(0, Math.floor(pathIndex)); // Ensure never negative
            const ceilIndex = Math.min(Math.max(0, floorIndex + 1), path.length - 1); // Ensure valid bounds
            const localProgress = Math.max(0, pathIndex - floorIndex); // Ensure never negative
            
            // Validate path points exist
            if (!path[floorIndex] || !path[ceilIndex]) {
                console.error(`Invalid path points at indices ${floorIndex}, ${ceilIndex} for missile ${missileId}`);
                console.error(`Progress: ${progress}, PathIndex: ${pathIndex}, Path length: ${path.length}`);
                console.error(`FloorIndex: ${floorIndex}, CeilIndex: ${ceilIndex}`);
                console.error(`Path[${floorIndex}]:`, path[floorIndex]);
                console.error(`Path[${ceilIndex}]:`, path[ceilIndex]);
                this.removeMissile(missileId);
                return;
            }
            
            // Validate path points have coordinates
            if (typeof path[floorIndex].x !== 'number' || typeof path[floorIndex].y !== 'number' ||
                typeof path[ceilIndex].x !== 'number' || typeof path[ceilIndex].y !== 'number') {
                console.error(`Invalid coordinates in path for missile ${missileId}:`, {
                    floor: path[floorIndex],
                    ceil: path[ceilIndex]
                });
                this.removeMissile(missileId);
                return;
            }
            
            const currentPos = {
                x: path[floorIndex].x + (path[ceilIndex].x - path[floorIndex].x) * localProgress,
                y: path[floorIndex].y + (path[ceilIndex].y - path[floorIndex].y) * localProgress
            };
            
            // Update missile position with dynamic scaling based on progress
            const missileElement = missile.element.querySelector('.missile-body');
            if (missileElement) {
                missileElement.setAttribute('cx', currentPos.x);
                missileElement.setAttribute('cy', currentPos.y);
                
                // Add missile glow effect that intensifies as it approaches target
                const intensity = 1 + progress * 2; // Glow gets stronger
                const glowRadius = this.visualConfig.missile.glowRadius * intensity;
                missileElement.style.filter = `drop-shadow(0 0 ${glowRadius}px ${this.visualConfig.missile.color})`;
            }
            
            // Update missile trail
            missile.trail.push({ ...currentPos });
            if (missile.trail.length > this.visualConfig.missile.trailLength) {
                missile.trail.shift();
            }
            this.updateMissileTrail(missileId, missile.trail);
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Get visualization statistics
     */
    getStatistics() {
        return {
            activeTrajectories: this.activeTrajectories.size,
            activeMissiles: this.activeMissiles.size,
            activeExplosions: this.activeExplosions.size,
            isInitialized: !!this.svgContainer
        };
    }

    /**
     * Update visual configuration
     */
    updateConfig(newConfig) {
        this.visualConfig = { ...this.visualConfig, ...newConfig };
        console.log('Missile visualization config updated');
    }

    /**
     * Destroy visualization system
     */
    destroy() {
        this.clearAll();
        
        if (this.svgContainer) {
            if (this.trajectoryGroup) this.svgContainer.removeChild(this.trajectoryGroup);
            if (this.missileGroup) this.svgContainer.removeChild(this.missileGroup);
            if (this.effectsGroup) this.svgContainer.removeChild(this.effectsGroup);
        }

        this.svgContainer = null;
        this.trajectoryGroup = null;
        this.missileGroup = null;
        this.effectsGroup = null;

        console.log('Missile visualization destroyed');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MissileVisualization };
} else if (typeof window !== 'undefined') {
    window.MissileVisualization = MissileVisualization;
}