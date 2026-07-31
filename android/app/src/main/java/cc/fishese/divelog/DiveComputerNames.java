package cc.fishese.divelog;

/**
 * Shearwater BLE advertisement names accepted by the pinned libdivecomputer
 * filter ({@code dc_filter_shearwater} / {@code dc_match_name}). Matching is
 * case-insensitive and exact.
 */
final class DiveComputerNames {
    // Keep in sync with vendor/libdivecomputer/src/descriptor.c at the pin.
    private static final String[] SHEARWATER_BLE_NAMES = {
        "Predator",
        "Petrel",
        "Petrel 3",
        "NERD",
        "NERD 2",
        "Perdix",
        "Perdix 2",
        "Perdix 3",
        "Teric",
        "Peregrine",
        "Peregrine TX",
        "Tern",
    };

    private DiveComputerNames() {}

    static boolean matchesShearwaterAdvertisement(String name) {
        if (name == null || name.isEmpty()) {
            return false;
        }
        for (String candidate : SHEARWATER_BLE_NAMES) {
            if (name.equalsIgnoreCase(candidate)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Classic Shearwater GATT only for this spike. Perdix 3 uses a different
     * service UUID and stays out of scope until validated separately.
     */
    static boolean isClassicShearwaterTarget(String name) {
        return matchesShearwaterAdvertisement(name)
            && !"Perdix 3".equalsIgnoreCase(name);
    }
}
