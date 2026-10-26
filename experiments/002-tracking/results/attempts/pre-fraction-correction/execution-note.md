# Preserved before settling-fraction correction

The censor-aware P95 change temporarily reused the all-transition percentile series to calculate settling fraction, counting censored cases as settled. This copy preserves the exact source, protocol, test output, and run. The corrected metric now counts only actually settled transitions in the numerator while retaining censored times in P95.
