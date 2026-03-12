# Test if the R 2.8.1 BayesMendel package can load in R 4.5.3
old_lib <- "C:/Program Files (x86)/R/R-2.8.1/library"
.libPaths(c(old_lib, .libPaths()))

cat("Trying to load BayesMendel from:", old_lib, "\n")
tryCatch({
  library(BayesMendel)
  cat("SUCCESS: BayesMendel loaded.\n")
  cat("Version:", as.character(packageVersion("BayesMendel")), "\n")
  # Check what functions are available
  fns <- ls("package:BayesMendel")
  cat("Exported functions:", length(fns), "\n")
  cat(paste(fns, collapse = ", "), "\n")
}, error = function(e) {
  cat("FAILED:", e$message, "\n")
})
