<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Chosen locker with its network logo for the buyer (cart, thank-you, My Account, emails)
 *
 * @link       https://eawb.ro
 * @since      1.5.0
 *
 * @package    Europarcel
 * @subpackage Europarcel/includes
 */
require_once EUROPARCELCOM_WC_ROOT_PATH . '/includes/class-europarcel-constants.php';

/**
 * EuroParcel Order Locker Class
 *
 * @since      1.5.0
 * @package    Europarcel
 * @subpackage Europarcel/includes
 */
class EuroParcelComWC_Order_Locker {

    /**
     * Locker row after shipping in the order totals (thank-you, My Account, emails)
     *
     * @since    1.5.0
     * @param    array       $total_rows     Order totals rows
     * @param    WC_Order    $order          The order
     * @param    string      $tax_display    Tax display mode
     * @return   array
     */
    public function add_order_item_totals_row($total_rows, $order, $tax_display) {
        foreach ($order->get_items('shipping') as $item) {
            if (strpos($item->get_method_id(), 'europarcelcom_wc_shipping') !== 0 || (int) $item->get_meta('service_id') !== 2) {
                continue;
            }
            $locker_name = $item->get_meta('_europarcel_locker_name');
            if (empty($locker_name)) {
                continue;
            }
            $address = implode(', ', array_filter([
                $item->get_meta('_europarcel_locker_address'),
                $item->get_meta('_europarcel_locker_locality'),
                $item->get_meta('_europarcel_locker_county'),
            ], 'strlen'));
            $row = ['europarcel_locker' => [
                'label' => __('Locker:', 'europarcel-com'),
                // Emails get PNG: Outlook desktop does not show WebP
                'value' => self::render($item->get_meta('carrier_id'), $locker_name, $address, doing_action('woocommerce_email_order_details') ? 'png' : 'webp'),
            ]];
            $position = array_search('shipping', array_keys($total_rows), true);
            $position = $position === false ? count($total_rows) : $position + 1;
            return array_slice($total_rows, 0, $position, true) + $row + array_slice($total_rows, $position, null, true);
        }
        return $total_rows;
    }

    /**
     * Locker markup: network logo on its own line (inline size for themes and email clients), name, address
     *
     * @since    1.5.0
     * @param    int       $carrier_id    Numeric carrier ID
     * @param    string    $name          Locker name
     * @param    string    $address       Full locker address
     * @param    string    $ext           Logo format: webp, or png for emails
     * @return   string
     */
    public static function render($carrier_id, $name, $address, $ext = 'webp') {
        $logo = \EuroparcelComWCShipping\EuroParcelComWC_Constants::get_locker_logo($carrier_id, $ext);
        $html = '<div class="europarcel-locker">';
        if ($logo) {
            $html .= '<img src="' . esc_url($logo['url']) . '" alt="' . esc_attr($logo['name']) . '" width="48" height="24" class="europarcel-locker-logo" style="display:block;width:48px;height:24px;margin-bottom:4px;" />';
        }
        $html .= '<strong class="europarcel-locker-name">' . esc_html($name) . '</strong>';
        if ($address !== '') {
            // Newline keeps name and address apart in plain-text emails (tags are stripped there)
            $html .= "<br />\n" . '<span class="europarcel-locker-address">' . esc_html($address) . '</span>';
        }
        return $html . '</div>';
    }
}
