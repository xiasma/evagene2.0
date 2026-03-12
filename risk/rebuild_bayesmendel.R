# Rebuild BayesMendel (and kinship) from the R 2.8.1 installed sources for R 4.5.3.

source("renv/activate.R")

src_dir <- "D:/dev/evagene/risk/_rebuild"
local_lib <- .libPaths()[1]

cat("Target library:", local_lib, "\n\n")

# kinship first (BayesMendel depends on it)
cat("--- Installing kinship ---\n")
tryCatch({
  install.packages(
    file.path(src_dir, "kinship"),
    repos = NULL,
    type = "source",
    lib = local_lib
  )
  cat("kinship: OK\n")
}, error = function(e) {
  cat("kinship from source FAILED:", e$message, "\n")
  cat("Trying kinship2 from CRAN (modern successor)...\n")
  install.packages("kinship2", repos = "https://cran.r-project.org", lib = local_lib)
})

cat("\n--- Installing BayesMendel ---\n")
tryCatch({
  install.packages(
    file.path(src_dir, "BayesMendel"),
    repos = NULL,
    type = "source",
    lib = local_lib
  )
  cat("BayesMendel: OK\n")
}, error = function(e) {
  cat("BayesMendel FAILED:", e$message, "\n")
})

# Test
cat("\n--- Testing ---\n")
tryCatch({
  library(BayesMendel)
  cat("BayesMendel loaded successfully.\n")
  cat("Version:", as.character(packageVersion("BayesMendel")), "\n")
  fns <- ls("package:BayesMendel")
  cat("Functions:", paste(fns, collapse = ", "), "\n")
}, error = function(e) {
  cat("Load test FAILED:", e$message, "\n")
})
