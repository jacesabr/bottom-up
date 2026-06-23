/**
 * Target Manager for Global Thermonuclear War
 * Handles target visualization, interaction, and selection on the world map
 */

class TargetManager {
    constructor() {
        // Player configuration
        this.playerFaction = null;
        this.selectedTarget = null;
        
        // Visual configuration
        this.visibleAssetTypes = ['city', 'militaryBase', 'submarine'];
        this.visibleFactions = ['us', 'ussr'];
        
        // SVG namespace for creating elements
        this.svgNS = 'http://www.w3.org/2000/svg';
        
        // Target interaction callbacks
        this.targetHoverCallbacks = [];
        this.targetSelectionCallbacks = [];
        this.targetDestructionCallbacks = [];
        
        // Target state tracking
        this.targetElements = new Map();
        this.destroyedAssets = new Set();
        
        // Hover tooltip element
        this.tooltipElement = null;
        
        // Asset styling configuration
        this.assetStyles = {
            player: {
                fillOpacity: 0.8,
                strokeOpacity: 1.0,
                borderColor: '#00ff00',
                borderWidth: 2
            },
            enemy: {
                fillOpacity: 0.6,
                strokeOpacity: 0.8,
                borderColor: '#ff0000',
                borderWidth: 1
            },
            destroyed: {
                fillOpacity: 0.2,
                strokeOpacity: 0.3,
                borderColor: '#666666',
                borderWidth: 1
            }
        };
    }

    /**
     * Set the player's faction
     */
    setPlayerFaction(faction) {
        this.playerFaction = faction;
        console.log(`Target manager configured for faction: ${faction}`);
    }

    /**
     * Create SVG element for target
     */
    createTargetElement(asset) {
        if (!asset || !asset.coordinates) {
            console.warn('Invalid asset for target element creation');
            return null;
        }

        const svgElement = document.createElementNS(this.svgNS, 'g');
        svgElement.setAttribute('class', 'target-asset');
        svgElement.setAttribute('data-asset-id', asset.id);
        svgElement.setAttribute('data-asset-type', asset.type);
        svgElement.setAttribute('data-faction', asset.faction);

        // Create the visual element based on asset type
        const visualElement = this.createAssetVisual(asset);
        if (visualElement) {
            svgElement.appendChild(visualElement);
        }

        // Add interaction handlers
        this.addTargetInteractions(svgElement, asset);

        // Store reference
        this.targetElements.set(asset.id, svgElement);

        return svgElement;
    }

    /**
     * Create visual representation of asset
     */
    createAssetVisual(asset) {
        const coords = asset.coordinates;
        const assetType = asset.type;
        
        // Get asset type configuration
        const typeConfig = this.getAssetTypeConfig(assetType);
        if (!typeConfig) return null;

        let element;

        // Create different shapes for different asset types
        switch (typeConfig.shape) {
            case 'circle':
                element = document.createElementNS(this.svgNS, 'circle');
                element.setAttribute('cx', coords.x);
                element.setAttribute('cy', coords.y);
                element.setAttribute('r', typeConfig.size);
                break;

            case 'square':
                element = document.createElementNS(this.svgNS, 'rect');
                element.setAttribute('x', coords.x - typeConfig.size / 2);
                element.setAttribute('y', coords.y - typeConfig.size / 2);
                element.setAttribute('width', typeConfig.size);
                element.setAttribute('height', typeConfig.size);
                break;

            case 'triangle':
                element = document.createElementNS(this.svgNS, 'polygon');
                const size = typeConfig.size;
                const points = [
                    `${coords.x},${coords.y - size}`,
                    `${coords.x - size},${coords.y + size}`,
                    `${coords.x + size},${coords.y + size}`
                ].join(' ');
                element.setAttribute('points', points);
                break;

            default:
                element = document.createElementNS(this.svgNS, 'circle');
                element.setAttribute('cx', coords.x);
                element.setAttribute('cy', coords.y);
                element.setAttribute('r', typeConfig.size);
                break;
        }

        // Apply styling
        const styles = this.getAssetStyles(asset);
        element.setAttribute('fill', typeConfig.color);
        element.setAttribute('fill-opacity', styles.fillOpacity);
        element.setAttribute('stroke', styles.borderColor);
        element.setAttribute('stroke-width', styles.borderWidth);
        element.setAttribute('stroke-opacity', styles.strokeOpacity);

        return element;
    }

    /**
     * Get asset type configuration
     */
    getAssetTypeConfig(assetType) {
        const configs = {
            city: {
                color: '#ffff00',
                size: 4,
                shape: 'circle',
                priority: 3
            },
            militaryBase: {
                color: '#ff6600',
                size: 3,
                shape: 'square',
                priority: 2
            },
            submarine: {
                color: '#0066cc',
                size: 2.5,
                shape: 'triangle',
                priority: 1
            }
        };

        return configs[assetType] || configs.city;
    }

    /**
     * Add interaction handlers to target element
     */
    addTargetInteractions(element, asset) {
        // Mouse hover
        element.addEventListener('mouseenter', (event) => {
            this.handleTargetHover(asset, event);
            this.showTooltip(asset, event);
        });

        element.addEventListener('mouseleave', (event) => {
            this.hideTooltip();
        });

        // Mouse click
        element.addEventListener('click', (event) => {
            this.selectTarget(asset);
            event.stopPropagation();
        });

        // Set cursor based on asset type and ownership
        const cursor = this.getCursorForAsset(asset);
        element.style.cursor = cursor;
    }

    /**
     * Handle target hover
     */
    handleTargetHover(asset, event) {
        const hoverData = {
            asset: asset,
            displayName: asset.name,
            type: asset.type,
            faction: asset.faction,
            coordinates: asset.coordinates
        };

        this.targetHoverCallbacks.forEach(callback => {
            try {
                callback(hoverData);
            } catch (error) {
                console.error('Error in target hover callback:', error);
            }
        });
    }

    /**
     * Show tooltip for asset
     */
    showTooltip(asset, event) {
        if (!this.tooltipElement) {
            this.tooltipElement = document.createElement('div');
            this.tooltipElement.className = 'target-tooltip';
            this.tooltipElement.style.position = 'absolute';
            this.tooltipElement.style.backgroundColor = '#000000';
            this.tooltipElement.style.color = '#00ff00';
            this.tooltipElement.style.padding = '5px 10px';
            this.tooltipElement.style.border = '1px solid #00ff00';
            this.tooltipElement.style.borderRadius = '3px';
            this.tooltipElement.style.fontSize = '12px';
            this.tooltipElement.style.fontFamily = 'VT323, monospace';
            this.tooltipElement.style.pointerEvents = 'none';
            this.tooltipElement.style.zIndex = '1000';
            document.body.appendChild(this.tooltipElement);
        }

        // Build tooltip content
        const content = [
            `<strong>${asset.name}</strong>`,
            `Type: ${asset.type}`,
            `Faction: ${asset.faction.toUpperCase()}`,
            `Status: ${asset.status}`
        ];

        if (asset.population) {
            content.push(`Population: ${asset.population.toLocaleString()}`);
        }

        if (asset.classification) {
            content.push(`Class: ${asset.classification}`);
        }

        this.tooltipElement.innerHTML = content.join('<br>');

        // Position tooltip
        const rect = event.target.getBoundingClientRect();
        this.tooltipElement.style.left = (rect.right + 10) + 'px';
        this.tooltipElement.style.top = rect.top + 'px';
        this.tooltipElement.style.display = 'block';
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltipElement) {
            this.tooltipElement.style.display = 'none';
        }
    }

    /**
     * Get cursor style for asset
     */
    getCursorForAsset(asset) {
        if (this.isPlayerAsset(asset)) {
            return 'default'; // Player assets are not targetable
        } else if (this.isEnemyAsset(asset)) {
            return 'crosshair'; // Enemy assets are targetable
        }
        return 'pointer';
    }

    /**
     * Select target
     */
    selectTarget(asset) {
        this.selectedTarget = asset;

        const selectionData = {
            asset: asset,
            timestamp: Date.now(),
            selectionType: 'click'
        };

        this.targetSelectionCallbacks.forEach(callback => {
            try {
                callback(selectionData);
            } catch (error) {
                console.error('Error in target selection callback:', error);
            }
        });

        console.log(`Target selected: ${asset.name} (${asset.type})`);
    }

    /**
     * Get currently selected target
     */
    getSelectedTarget() {
        return this.selectedTarget;
    }

    /**
     * Clear target selection
     */
    clearSelection() {
        this.selectedTarget = null;
    }

    /**
     * Check if asset belongs to player
     */
    isPlayerAsset(asset) {
        return asset.faction === this.playerFaction;
    }

    /**
     * Check if asset belongs to enemy
     */
    isEnemyAsset(asset) {
        return asset.faction !== this.playerFaction;
    }

    isPlayerAsset(asset) {
        return asset.faction === this.playerFaction;
    }

    /**
     * Get styling for asset based on ownership and status
     */
    getAssetStyles(asset) {
        if (this.isAssetDestroyed(asset)) {
            return this.assetStyles.destroyed;
        } else if (this.isPlayerAsset(asset)) {
            return this.assetStyles.player;
        } else {
            return this.assetStyles.enemy;
        }
    }

    /**
     * Set visible asset types
     */
    setVisibleAssetTypes(types) {
        this.visibleAssetTypes = [...types];
    }

    /**
     * Check if asset type is visible
     */
    isAssetTypeVisible(type) {
        return this.visibleAssetTypes.includes(type);
    }

    /**
     * Set visible factions
     */
    setVisibleFactions(factions) {
        this.visibleFactions = [...factions];
    }

    /**
     * Check if faction is visible
     */
    isFactionVisible(faction) {
        return this.visibleFactions.includes(faction);
    }

    /**
     * Check if asset should be shown
     */
    shouldShowAsset(asset) {
        return this.isAssetTypeVisible(asset.type) && this.isFactionVisible(asset.faction);
    }

    /**
     * Calculate distance between two assets
     */
    calculateDistance(asset1, asset2) {
        const dx = asset2.coordinates.x - asset1.coordinates.x;
        const dy = asset2.coordinates.y - asset1.coordinates.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if asset is within range
     */
    isWithinRange(asset1, asset2, range) {
        return this.calculateDistance(asset1, asset2) <= range;
    }

    /**
     * Destroy asset
     */
    destroyAsset(asset) {
        this.destroyedAssets.add(asset.id);
        asset.status = 'destroyed';

        // Update visual if element exists
        const element = this.targetElements.get(asset.id);
        if (element) {
            this.updateAssetVisual(element, asset);
        }

        const destructionData = {
            asset: asset,
            timestamp: Date.now(),
            cause: 'nuclear_strike'
        };

        this.targetDestructionCallbacks.forEach(callback => {
            try {
                callback(destructionData);
            } catch (error) {
                console.error('Error in target destruction callback:', error);
            }
        });

        console.log(`Asset destroyed: ${asset.name}`);
    }

    /**
     * Check if asset is destroyed
     */
    isAssetDestroyed(asset) {
        return this.destroyedAssets.has(asset.id) || asset.status === 'destroyed';
    }

    /**
     * Update visual representation of asset
     */
    updateAssetVisual(element, asset) {
        const visualElement = element.querySelector('circle, rect, polygon');
        if (!visualElement) return;

        const styles = this.getAssetStyles(asset);
        visualElement.setAttribute('fill-opacity', styles.fillOpacity);
        visualElement.setAttribute('stroke', styles.borderColor);
        visualElement.setAttribute('stroke-width', styles.borderWidth);
        visualElement.setAttribute('stroke-opacity', styles.strokeOpacity);
    }

    /**
     * Register target hover callback
     */
    onTargetHover(callback) {
        if (typeof callback === 'function') {
            this.targetHoverCallbacks.push(callback);
        }
    }

    /**
     * Register target selection callback
     */
    onTargetSelection(callback) {
        if (typeof callback === 'function') {
            this.targetSelectionCallbacks.push(callback);
        }
    }

    /**
     * Register asset destruction callback
     */
    onAssetDestruction(callback) {
        if (typeof callback === 'function') {
            this.targetDestructionCallbacks.push(callback);
        }
    }

    /**
     * Get all target elements
     */
    getTargetElements() {
        return this.targetElements;
    }

    /**
     * Remove target element
     */
    removeTargetElement(assetId) {
        const element = this.targetElements.get(assetId);
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
        this.targetElements.delete(assetId);
    }

    /**
     * Clear all target elements
     */
    clearAllTargets() {
        this.targetElements.forEach((element, assetId) => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.targetElements.clear();
        this.hideTooltip();
    }

    /**
     * Reset target manager
     */
    reset() {
        this.clearAllTargets();
        this.clearSelection();
        this.destroyedAssets.clear();
        this.playerFaction = null;
        console.log('Target manager reset');
    }
}

// Export for both CommonJS (testing) and ES modules (browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TargetManager };
} else if (typeof window !== 'undefined') {
    window.TargetManager = TargetManager;
}