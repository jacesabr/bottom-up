/**
 * Performance Monitor for Global Thermonuclear War
 * Sprint 14: Performance monitoring and optimization system
 */

class PerformanceMonitor {
    constructor() {
        // Performance metrics tracking
        this.metrics = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            animationCount: 0,
            renderTime: 0,
            lastFrameTime: 0,
            frameCount: 0,
            startTime: performance.now()
        };
        
        // FPS tracking
        this.fpsHistory = [];
        this.maxFpsHistory = 60; // Keep last 60 FPS readings
        this.fpsUpdateInterval = 1000; // Update FPS every second
        this.lastFpsUpdate = 0;
        
        // Performance thresholds
        this.thresholds = {
            targetFps: 60,
            minFps: 30,
            maxFrameTime: 16.67, // 60fps target
            maxMemoryUsage: 100 * 1024 * 1024, // 100MB
            maxAnimations: 50
        };
        
        // Performance state
        this.isMonitoring = false;
        this.performanceLevel = 'HIGH'; // HIGH, MEDIUM, LOW
        this.adaptiveQuality = true;
        
        // Monitoring intervals
        this.fpsInterval = null;
        this.memoryInterval = null;
        
        // Event callbacks
        this.performanceChangeCallbacks = [];
        this.thresholdExceededCallbacks = [];
        
        // Animation frame tracking
        this.animationFrameId = null;
        this.frameCallbacks = [];
        
        console.log('Performance Monitor initialized - Target FPS: 60');
    }
    
    /**
     * Start performance monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.metrics.startTime = performance.now();
        this.lastFpsUpdate = this.metrics.startTime;
        
        // Start FPS monitoring
        this.startFpsMonitoring();
        
        // Start memory monitoring if available
        if (performance.memory) {
            this.startMemoryMonitoring();
        }
        
        console.log('Performance monitoring started');
    }
    
    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        
        // Cancel intervals
        if (this.fpsInterval) {
            clearInterval(this.fpsInterval);
            this.fpsInterval = null;
        }
        
        if (this.memoryInterval) {
            clearInterval(this.memoryInterval);
            this.memoryInterval = null;
        }
        
        // Cancel animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        console.log('Performance monitoring stopped');
    }
    
    /**
     * Start FPS monitoring using animation frames
     */
    startFpsMonitoring() {
        const measureFrame = (timestamp) => {
            if (!this.isMonitoring) return;
            
            // Calculate frame time
            if (this.metrics.lastFrameTime > 0) {
                const frameTime = timestamp - this.metrics.lastFrameTime;
                this.metrics.frameTime = frameTime;
                this.metrics.frameCount++;
                
                // Update FPS every second
                if (timestamp - this.lastFpsUpdate >= this.fpsUpdateInterval) {
                    const elapsed = timestamp - this.lastFpsUpdate;
                    this.metrics.fps = Math.round((this.metrics.frameCount * 1000) / elapsed);
                    
                    // Add to FPS history
                    this.fpsHistory.push(this.metrics.fps);
                    if (this.fpsHistory.length > this.maxFpsHistory) {
                        this.fpsHistory.shift();
                    }
                    
                    // Check performance thresholds
                    this.checkPerformanceThresholds();
                    
                    // Reset counters
                    this.metrics.frameCount = 0;
                    this.lastFpsUpdate = timestamp;
                }
            }
            
            this.metrics.lastFrameTime = timestamp;
            
            // Execute frame callbacks
            this.frameCallbacks.forEach(callback => {
                try {
                    callback(timestamp, this.metrics);
                } catch (error) {
                    console.error('Error in frame callback:', error);
                }
            });
            
            // Continue monitoring
            this.animationFrameId = requestAnimationFrame(measureFrame);
        };
        
        this.animationFrameId = requestAnimationFrame(measureFrame);
    }
    
    /**
     * Start memory monitoring
     */
    startMemoryMonitoring() {
        this.memoryInterval = setInterval(() => {
            if (performance.memory) {
                this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
                
                // Check memory thresholds
                if (this.metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
                    this.onThresholdExceeded('memory', this.metrics.memoryUsage);
                }
            }
        }, 5000); // Check memory every 5 seconds
    }
    
    /**
     * Check performance thresholds and adjust quality
     */
    checkPerformanceThresholds() {
        const avgFps = this.getAverageFps();
        
        // Adjust performance level based on FPS
        let newLevel = this.performanceLevel;
        
        if (avgFps < this.thresholds.minFps) {
            newLevel = 'LOW';
            this.onThresholdExceeded('fps', avgFps);
        } else if (avgFps < this.thresholds.targetFps * 0.8) {
            newLevel = 'MEDIUM';
        } else {
            newLevel = 'HIGH';
        }
        
        // Update performance level if changed
        if (newLevel !== this.performanceLevel) {
            const oldLevel = this.performanceLevel;
            this.performanceLevel = newLevel;
            this.onPerformanceLevelChange(oldLevel, newLevel);
        }
    }
    
    /**
     * Get average FPS from history
     */
    getAverageFps() {
        if (this.fpsHistory.length === 0) return 0;
        
        const sum = this.fpsHistory.reduce((acc, fps) => acc + fps, 0);
        return sum / this.fpsHistory.length;
    }
    
    /**
     * Handle performance level changes
     */
    onPerformanceLevelChange(oldLevel, newLevel) {
        console.log(`Performance level changed: ${oldLevel} → ${newLevel}`);
        
        // Apply adaptive quality settings
        if (this.adaptiveQuality) {
            this.applyQualitySettings(newLevel);
        }
        
        // Notify callbacks
        this.performanceChangeCallbacks.forEach(callback => {
            try {
                callback(oldLevel, newLevel, this.metrics);
            } catch (error) {
                console.error('Error in performance change callback:', error);
            }
        });
    }
    
    /**
     * Handle threshold exceeded events
     */
    onThresholdExceeded(metric, value) {
        console.warn(`Performance threshold exceeded - ${metric}: ${value}`);
        
        // Notify callbacks
        this.thresholdExceededCallbacks.forEach(callback => {
            try {
                callback(metric, value, this.metrics);
            } catch (error) {
                console.error('Error in threshold exceeded callback:', error);
            }
        });
    }
    
    /**
     * Apply quality settings based on performance level
     */
    applyQualitySettings(level) {
        const body = document.body;
        
        // Remove existing performance classes
        body.classList.remove('perf-high', 'perf-medium', 'perf-low');
        
        // Apply new performance class
        body.classList.add(`perf-${level.toLowerCase()}`);
        
        // Adjust animation settings
        switch (level) {
            case 'LOW':
                this.disableExpensiveAnimations();
                this.reduceAnimationFrequency();
                break;
            case 'MEDIUM':
                this.enableOptimizedAnimations();
                break;
            case 'HIGH':
                this.enableAllAnimations();
                break;
        }
    }
    
    /**
     * Disable expensive animations for low performance
     */
    disableExpensiveAnimations() {
        const style = document.createElement('style');
        style.id = 'perf-low-override';
        style.textContent = `
            .perf-low .explosion-pulse,
            .perf-low .main-message-pulse,
            .perf-low .final-scanlines {
                animation: none !important;
            }
            .perf-low *::before,
            .perf-low *::after {
                display: none !important;
            }
        `;
        
        // Remove existing style if present
        const existing = document.getElementById('perf-low-override');
        if (existing) existing.remove();
        
        document.head.appendChild(style);
    }
    
    /**
     * Enable optimized animations for medium performance
     */
    enableOptimizedAnimations() {
        const style = document.createElement('style');
        style.id = 'perf-medium-override';
        style.textContent = `
            .perf-medium .animated {
                animation-duration: 0.5s !important;
            }
            .perf-medium .explosion-pulse {
                animation-duration: 0.5s !important;
            }
        `;
        
        // Remove existing styles
        const lowStyle = document.getElementById('perf-low-override');
        if (lowStyle) lowStyle.remove();
        
        const existing = document.getElementById('perf-medium-override');
        if (existing) existing.remove();
        
        document.head.appendChild(style);
    }
    
    /**
     * Enable all animations for high performance
     */
    enableAllAnimations() {
        // Remove performance override styles
        const lowStyle = document.getElementById('perf-low-override');
        const mediumStyle = document.getElementById('perf-medium-override');
        
        if (lowStyle) lowStyle.remove();
        if (mediumStyle) mediumStyle.remove();
    }
    
    /**
     * Reduce animation frequency for better performance
     */
    reduceAnimationFrequency() {
        // This would be called by animation systems to reduce update frequency
        console.log('Reducing animation frequency for better performance');
    }
    
    /**
     * Add frame callback for custom monitoring
     */
    addFrameCallback(callback) {
        this.frameCallbacks.push(callback);
    }
    
    /**
     * Remove frame callback
     */
    removeFrameCallback(callback) {
        const index = this.frameCallbacks.indexOf(callback);
        if (index > -1) {
            this.frameCallbacks.splice(index, 1);
        }
    }
    
    /**
     * Add performance change callback
     */
    addPerformanceChangeCallback(callback) {
        this.performanceChangeCallbacks.push(callback);
    }
    
    /**
     * Add threshold exceeded callback
     */
    addThresholdExceededCallback(callback) {
        this.thresholdExceededCallbacks.push(callback);
    }
    
    /**
     * Get current performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            averageFps: this.getAverageFps(),
            performanceLevel: this.performanceLevel,
            uptime: performance.now() - this.metrics.startTime
        };
    }
    
    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const metrics = this.getMetrics();
        
        return {
            fps: {
                current: metrics.fps,
                average: metrics.averageFps,
                min: Math.min(...this.fpsHistory),
                max: Math.max(...this.fpsHistory)
            },
            frameTime: {
                current: metrics.frameTime,
                target: this.thresholds.maxFrameTime
            },
            memory: {
                used: metrics.memoryUsage,
                usedMB: Math.round(metrics.memoryUsage / 1024 / 1024),
                maxMB: Math.round(this.thresholds.maxMemoryUsage / 1024 / 1024)
            },
            performance: {
                level: metrics.performanceLevel,
                uptime: Math.round(metrics.uptime / 1000),
                adaptiveQuality: this.adaptiveQuality
            }
        };
    }
    
    /**
     * Reset performance monitoring
     */
    reset() {
        this.stopMonitoring();
        
        // Reset metrics
        this.metrics = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            animationCount: 0,
            renderTime: 0,
            lastFrameTime: 0,
            frameCount: 0,
            startTime: performance.now()
        };
        
        // Clear history
        this.fpsHistory = [];
        this.performanceLevel = 'HIGH';
        
        console.log('Performance monitor reset');
    }
}

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceMonitor };
} else if (typeof window !== 'undefined') {
    window.PerformanceMonitor = PerformanceMonitor;
}