"""Dupuy et al. (2018), Table 1: soreness, not performance or recovery speed.

Keep water immersion pooled; a cold-only estimate belongs to Table 2.
"""

SOURCE_URL = "https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00403/full"
DOMS_ESTIMATES = {
    "massage": (-2.26, -3.05, -1.47, 158, 14),
    "active-recovery": (-0.94, -1.61, -0.28, 90, 8),
    "compression": (-0.92, -1.34, -0.50, 160, 16),
    "cryotherapy": (-0.53, -1.04, -0.03, 72, 6),
    "immersion": (-0.47, -0.77, -0.18, 379, 34),
    "contrast-water": (-0.40, -0.73, -0.07, 144, 12),
}
