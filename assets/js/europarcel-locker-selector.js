/**
 * EuroParcel Locker Selector
 *
 * Handles locker selection functionality for both WooCommerce Classic
 * and Blocks checkout. Manages checkout detection, button creation,
 * and locker selection workflow.
 *
 * @package    Europarcel
 * @since      1.0.9
 */

(function ($) {
	'use strict';

	const checkoutType = europarcelcom_wc_ajax.checkout_type || 'blocks';

	/**
	 * Helper function to get WooCommerce county/state
	 */
	window.getWooCommerceCounty = function() {
		const stateSelectors = [
			'#shipping_state',
			'#billing_state',
			'#calc_shipping_state',
			'.wc-block-components-address-form select[id*="state"]',
			'select[name*="state"]'
		];

		for (const selector of stateSelectors) {
			const element = document.querySelector(selector);
			if (element && element.value) {
				return element.value;
			}
		}
		return null;
	};

	/**
	 * Helper function to get WooCommerce city
	 */
	window.getWooCommerceCity = function() {
		const citySelectors = [
			'#shipping_city',
			'#billing_city',
			'#calc_shipping_city',
			'.wc-block-components-address-form input[id*="city"]',
			'input[name*="city"]'
		];

		for (const selector of citySelectors) {
			const element = document.querySelector(selector);
			if (element && element.value) {
				return element.value;
			}
		}
		return null;
	};

	/**
	 * Helper function to get selected shipping instance ID
	 */
	window.getSelectedShippingInstanceId = function() {
		let selectedMethod = document.querySelector('input[name^="shipping_method"]:checked') ||
			document.querySelector('.wc-block-components-radio-control__input:checked');

		if (selectedMethod) {
			const methodValue = selectedMethod.value || selectedMethod.id;
			const parts = methodValue.split(':');
			if (parts.length > 1) {
				// Extract only the numeric instance ID (remove suffixes like _free_h2h, _fixed_locker, etc.)
				const instancePart = parts[1];
				const match = instancePart.match(/^(\d+)/);
				if (match) {
					return match[1];
				}
				return instancePart;
			}

			const underscoreParts = methodValue.split('_');
			if (underscoreParts.length > 1)
				return underscoreParts[underscoreParts.length - 1];
		}

		return '1';
	};

	/**
	 * Handle locker selection for classic checkout button
	 * Called from PHP onclick handler
	 */
	window.openLockerSelector = function() {
		const county = window.getWooCommerceCounty();
		const city = window.getWooCommerceCity();

		const instanceId = window.getSelectedShippingInstanceId();
		const carrierIds = europarcelcom_wc_ajax.instances_lockers && europarcelcom_wc_ajax.instances_lockers[instanceId]
			? europarcelcom_wc_ajax.instances_lockers[instanceId]
			: [];

		if (!carrierIds || carrierIds.length === 0) {
			alert(europarcelcom_wc_ajax.i18n.no_carriers_configured);
			return;
		}

		let iframeUrl = `https://maps.europarcel.com/?country_code=RO&carrier_id=${carrierIds.join(',')}`;
		if (county) {
			iframeUrl += `&county_name=${encodeURIComponent(county)}`;
		}
		if (city) {
			iframeUrl += `&locality_name=${encodeURIComponent(city)}`;
		}

		if (window.EuroparcelModal) {
			window.EuroparcelModal.show(iframeUrl);
		}
	};

	/**
	 * Initialize locker selector functionality
	 */
        function initializeLockerSelector() {
		let instances_lockers = europarcelcom_wc_ajax.instances_lockers;
		let user_lockers = europarcelcom_wc_ajax.user_lockers;
		let order_lockers = europarcelcom_wc_ajax.order_lockers;

		// A saved locker counts only if the instance still offers its network
		const offersCarrier = (instanceId, carrierId) => ((instances_lockers && instances_lockers[instanceId]) || []).map(Number).includes(Number(carrierId));

		// Block cart: read-only box under the shipping total for the selected locker rate
		if (checkoutType === 'cart') {
			// The cart block shows the selected rate as text, so read it from the cart store
			const selectedRateId = () => {
				const cartStore = window.wp && wp.data ? wp.data.select('wc/store/cart') : null;
				for (const pkg of cartStore ? cartStore.getShippingRates() : []) {
					const rate = (pkg.shipping_rates || []).find((r) => r.selected);
					if (rate) {
						return rate.rate_id;
					}
				}
				const radio = document.querySelector('.wc-block-components-radio-control__input:checked');
				return radio ? radio.value : '';
			};
			const showCartLocker = () => {
				const match = selectedRateId().match(/^europarcelcom_wc_shipping:(\d+)_\w*locker$/);
				const saved = match && user_lockers ? user_lockers[match[1]] : null;
				const locker = saved && offersCarrier(match[1], saved.carrier_id) ? saved : null;
				let box = document.getElementById('europarcel-cart-locker');
				if (!locker) {
					if (box) {
						box.remove();
					}
					return;
				}
				const key = `${match[1]}:${locker.locker_id}`;
				const shippingRow = document.querySelector('.wc-block-components-totals-shipping');
				// Skip when already shown: store and DOM updates call this often, our own insert included
				if ((box && box.dataset.key === key) || !shippingRow) {
					return;
				}
				if (!box) {
					box = document.createElement('div');
					box.id = 'europarcel-cart-locker';
					shippingRow.after(box);
				}
				box.dataset.key = key;
				box.replaceChildren(buildLockerBox(locker));
			};
			showCartLocker();
			if (window.wp && wp.data) {
				wp.data.subscribe(showCartLocker);
			}
			new MutationObserver(showCartLocker).observe(document.body, { childList: true, subtree: true });
			return;
		}

		function updateButtonText(button, hasSelectedLocker) {
			const newText = hasSelectedLocker ? europarcelcom_wc_ajax.i18n.modify_locker : europarcelcom_wc_ajax.i18n.select_locker;
			button.textContent = newText;
		}

		/**
		 * Display locker information - handles both new selections and saved lockers
		 */
		function displayLockerInfo(lockerData, isNewSelection = false) {
			if (!lockerData) {
				return;
			}

			const button = checkoutType === 'blocks'
				? document.getElementById('europarcel-blocks-locker-btn')
				: document.querySelector('button[onclick="openLockerSelector()"]');
			if (button) {
				button.textContent = europarcelcom_wc_ajax.i18n.modify_locker;
			}

			const details = document.getElementById(checkoutType === 'blocks' ? 'europarcel-blocks-location-details' : 'europarcel-location-details');
			if (details) {
				details.replaceChildren(buildLockerBox(lockerData));
				details.style.display = 'block';
			}
		}

		/**
		 * Locker box as DOM nodes (data comes from outside, never as HTML); saved and new locker shapes
		 */
		function buildLockerBox(locker) {
			const box = document.createElement('div');
			box.style.cssText = 'margin-top: 10px; padding: 15px; border: 1px solid rgba(0,0,0,0.1); border-radius: 4px; background-color: rgba(0,0,0,0.02);';

			const title = document.createElement('div');
			title.style.cssText = 'font-weight: bold; margin-bottom: 4px;';
			const logo = europarcelcom_wc_ajax.locker_logos && europarcelcom_wc_ajax.locker_logos[locker.carrier_id];
			if (logo) {
				const img = document.createElement('img');
				img.src = logo.url;
				img.alt = logo.name;
				img.width = 48;
				img.height = 24;
				img.className = 'europarcel-locker-logo';
				img.style.cssText = 'display: inline-block; vertical-align: middle; width: 48px; height: 24px; margin-right: 6px;';
				title.appendChild(img);
			}
			title.appendChild(document.createTextNode(`${europarcelcom_wc_ajax.i18n.locker_selected} ${locker.carrier_name || ''}`));

			const name = document.createElement('div');
			name.style.cssText = 'font-weight: 600; margin-bottom: 2px;';
			name.textContent = locker.locker_name || locker.name || '';

			const address = document.createElement('div');
			address.textContent = locker.locker_address || locker.address || '';

			box.append(title, name, address);
			return box;
		}

		/**
		 * Check and display saved locker for current shipping method
		 */
		function checkAndDisplaySavedLocker() {
			if (!user_lockers || Object.keys(user_lockers).length === 0) {
				return;
			}

			const instanceId = window.getSelectedShippingInstanceId();
			const availableCarriers = instances_lockers && instances_lockers[instanceId] 
				? instances_lockers[instanceId] 
				: [];

			// Find a saved locker that matches available carriers for current shipping method
			/*
                        for (const carrierKey in user_lockers) {
				if (availableCarriers.includes(parseInt(carrierKey))) {
					displayLockerInfo(user_lockers[carrierKey]);
					return;
				}
			}
                     * 
                         */
                        if (instanceId in user_lockers && offersCarrier(instanceId, user_lockers[instanceId].carrier_id)) {
                            displayLockerInfo(user_lockers[instanceId]);
                            return;
                        }
		}

        const addLockerButtonToReviewSection = () => {
            if (checkoutType === 'blocks') {
                const reviewSelectors = [
                    '.wc-block-components-order-summary',
                    '.wc-block-checkout__order-summary',  
                    '.wc-block-components-totals',
                    '.wp-block-woocommerce-checkout-order-summary-block',
                    '.wc-block-components-order-summary-item',
                    '.wc-block-checkout-order-summary',
                    '.wc-block-components-sidebar'
                ];
                
                let reviewContainer = null;
                for (const selector of reviewSelectors) {
                    const found = document.querySelector(selector);
                    if (found && !reviewContainer) {
                        reviewContainer = found;
                        break;
                    }
                }

                if (reviewContainer && !document.getElementById('europarcel-blocks-locker-btn')) {
                    const lockerRow = document.createElement('div');
                    lockerRow.id = 'europarcel-blocks-locker-container';
                    lockerRow.style.marginTop = '20px';
                    lockerRow.style.padding = '15px';
                    lockerRow.style.border = '1px solid rgba(0,0,0,0.1)';
                    lockerRow.style.borderRadius = '4px';
                    lockerRow.style.backgroundColor = 'rgba(0,0,0,0.02)';
                    lockerRow.style.display = 'none';
                    
                    const button = document.createElement('button');
                    button.id = 'europarcel-blocks-locker-btn';
                    button.className = 'button alt wp-element-button';
                    button.type = 'button';
                    button.style.width = '100%';
                    button.style.marginBottom = '10px';
                    button.textContent = europarcelcom_wc_ajax.i18n.select_locker;
                    button.onclick = function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        handleLockerSelection();
                    };
                    
                    const detailsDiv = document.createElement('div');
                    detailsDiv.id = 'europarcel-blocks-location-details';
                    detailsDiv.style.display = 'none';
                    
                    lockerRow.appendChild(button);
                    lockerRow.appendChild(detailsDiv);
                    reviewContainer.appendChild(lockerRow);
                }
            }
        };

        async function handleLockerSelection() {
            showLoadingState();

            try {
                const county = window.getWooCommerceCounty();
                const city = window.getWooCommerceCity();

                const instanceId = window.getSelectedShippingInstanceId();
                const carrierIds = europarcelcom_wc_ajax.instances_lockers && europarcelcom_wc_ajax.instances_lockers[instanceId]
                        ? europarcelcom_wc_ajax.instances_lockers[instanceId]
                        : [];

                if (!carrierIds || carrierIds.length === 0) {
                    alert(europarcelcom_wc_ajax.i18n.no_carriers_configured);
                    hideLoadingState();
                    return;
                }

                let iframeUrl = `https://maps.europarcel.com/?country_code=RO&carrier_id=${carrierIds.join(',')}`;
                if (county) {
                    iframeUrl += `&county_name=${encodeURIComponent(county)}`;
                }
                if (city) {
                    iframeUrl += `&locality_name=${encodeURIComponent(city)}`;
                }
                
                // Use the new modal object
                if (window.EuroparcelModal) {
                    window.EuroparcelModal.show(iframeUrl);
                }
                hideLoadingState();

            } catch (error) {
                hideLoadingState();
                // Silently handle error
            }
        }


        function showLoadingState() {
            if (checkoutType === 'blocks') {
                const button = document.getElementById('europarcel-blocks-locker-btn');
                if (button) {
                    button.disabled = true;
                    button.textContent = europarcelcom_wc_ajax.i18n.loading;
                    button.style.opacity = '0.7';
                }
            } else {
                document.querySelectorAll('.select-locker-btn').forEach(btn => {
                    btn.disabled = true;
                    btn.textContent = europarcelcom_wc_ajax.i18n.loading;
                    btn.style.opacity = '0.7';
                });
            }
        }

        function hideLoadingState() {
            if (checkoutType === 'blocks') {
                const button = document.getElementById('europarcel-blocks-locker-btn');
                if (button) {
                    button.disabled = false;
                    button.style.opacity = '1';
                    const hasSelectedLocker = user_lockers && Object.keys(user_lockers).length > 0;
                    updateButtonText(button, hasSelectedLocker);
                }
            } else {
                document.querySelectorAll('.select-locker-btn').forEach(btn => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    const instanceId = window.getSelectedShippingInstanceId();
                    const hasSelectedLocker = user_lockers && Object.keys(user_lockers).length > 0;
                    updateButtonText(btn, hasSelectedLocker);
                });
            }
        }

        window.addEventListener('message', function (event) {
            if (event.origin !== 'https://maps.europarcel.com') {
                return;
            }

            if (event.data && event.data.type === 'locker-selected') {
                const locker = event.data.locker;

                if (window.EuroparcelModal) {
                    window.EuroparcelModal.close();
                }

                // Hide any locker validation error notices (don't remove — React manages these nodes)
                document.querySelectorAll('.wc-block-store-notice, .woocommerce-error, .wc-block-components-notice-banner').forEach(function(notice) {
                    if (notice.textContent && notice.textContent.indexOf('locker') !== -1) {
                        notice.style.display = 'none';
                    }
                });

                displayLockerInfo(locker, true);
                updateWooCommerceFields(locker);
            }
        });

        function updateWooCommerceFields(locker) {
            $.ajax({
                url: europarcelcom_wc_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'europarcelcomwc_update_locker_shipping',
                    security: europarcelcom_wc_ajax.nonce,
                    instance_id: window.getSelectedShippingInstanceId(),
                    locker_id: locker.id,
                    carrier_id: locker.carrier_id,
                    carrier_name: locker.carrier_name,
                    locker_name: locker.name,
                    locker_address: locker.address,
                    locker_locality: locker.locality_name || '',
                    locker_county: locker.county_name || ''
                },
                dataType: 'json',
                success: function (response) {
                    if (response.success) {
                        user_lockers = response.data['user_locker'];
                        order_lockers = response.data['order_lockers'];
                    }
                    $("body").trigger("update_checkout");
                }
            });
        }

        function handleShippingMethodChange() {
            const selectedMethods = [
                document.querySelector('input[name^="shipping_method"]:checked'),
                document.querySelector('.wc-block-components-radio-control__input:checked'),
                document.querySelector('input[type="radio"]:checked[name*="shipping"]')
            ].filter(Boolean);

            let selectedMethod = selectedMethods[0];
            let isLockerMethod = false;

            if (selectedMethod) {
                const methodValue = selectedMethod.value || selectedMethod.id || '';
                // Check if it's a locker method (must have _locker suffix)
                isLockerMethod = methodValue.includes('europarcelcom_wc_shipping') && methodValue.includes('_locker');
            }

            // Check if current shipping method instance has locker services
            let hasLockerServices = false;
            if (isLockerMethod) {
                const instanceId = window.getSelectedShippingInstanceId();
                hasLockerServices = instances_lockers && instances_lockers[instanceId] && instances_lockers[instanceId].length > 0;
            }

            if (checkoutType === 'blocks') {
                const blocksContainer = document.getElementById('europarcel-blocks-locker-container');
                
                if (blocksContainer) {
                    if (isLockerMethod && hasLockerServices) {
                        blocksContainer.style.display = 'block';
                        checkAndDisplaySavedLocker();
                    } else {
                        blocksContainer.style.display = 'none';
                        const details = document.getElementById('europarcel-blocks-location-details');
                        if (details) {
                            details.style.display = 'none';
                        }
                    }
                }
            } else {
                if (isLockerMethod && hasLockerServices) {
                    checkAndDisplaySavedLocker();
                } else {
                    const details = document.getElementById('europarcel-location-details');
                    if (details) {
                        details.style.display = 'none';
                    }
                }
            }
        }

        // Handle shipping method changes
        $(document).on("change", "input[type=radio]", function() {
            if ((this.name && this.name.includes('shipping')) || 
                (this.value && (this.value.includes('shipping') || this.value.includes('europarcel'))) ||
                this.name === 'radio-control-0') {
                handleShippingMethodChange();
            }
        });

        $(document).on("change", "input[name^=shipping_method]", function() {
            handleShippingMethodChange();
        });

        $(document).on('updated_checkout updated_shipping_method', function() {
            addLockerButtonToReviewSection();
            handleShippingMethodChange();
        });

        if (checkoutType === 'blocks') {
            // For blocks, use MutationObserver to watch for dynamic content
            const initBlocks = () => {
                addLockerButtonToReviewSection();
                handleShippingMethodChange();
            };
            
            // Initial attempt
            initBlocks();
            
            // Watch for DOM changes in case blocks content loads later
            const observer = new MutationObserver(() => {
                if (!document.getElementById('europarcel-blocks-locker-btn')) {
                    initBlocks();
                }
            });
            
            observer.observe(document.body, { 
                childList: true, 
                subtree: true 
            });
        } else {
            handleShippingMethodChange();
        }
    }

	$(document).ready(initializeLockerSelector);

})(jQuery);