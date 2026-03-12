# Bootstrap renv and install project dependencies.
# Run from the risk/ directory:  Rscript setup.R

cat("Setting up renv...\n")

# Ensure renv is available
bootstrap_lib <- file.path(getwd(), "renv_bootstrap")
if (!dir.exists(bootstrap_lib)) {
  dir.create(bootstrap_lib, recursive = TRUE)
}

if (!requireNamespace("renv", quietly = TRUE)) {
  install.packages("renv", repos = "https://cran.r-project.org", lib = bootstrap_lib)
  .libPaths(c(bootstrap_lib, .libPaths()))
}

library(renv)
cat("renv version:", as.character(packageVersion("renv")), "\n")

# Initialize renv for this project
if (!file.exists("renv.lock")) {
  renv::init(bare = TRUE)
  cat("renv initialized.\n")
} else {
  cat("renv.lock already exists, activating...\n")
  renv::activate()
}

# Install CRAN dependencies
cat("\nInstalling plumber...\n")
renv::install("plumber")

# PanelPRO is not on CRAN or public GitHub.
# It must be obtained from the BayesMendel Lab at Harvard:
#   https://projects.iq.harvard.edu/bayesmendel/panelpro
#
# Once you have the package tarball (e.g. PanelPRO_x.y.z.tar.gz):
#   renv::install("path/to/PanelPRO_x.y.z.tar.gz")
#
# Or if you have GitHub access:
#   Sys.setenv(GITHUB_PAT = "your_token_here")
#   renv::install("bayesmendel/PanelPRO")

if (requireNamespace("PanelPRO", quietly = TRUE)) {
  cat("PanelPRO is installed:", as.character(packageVersion("PanelPRO")), "\n")
} else {
  cat("\n")
  cat("NOTE: PanelPRO is NOT installed yet.\n")
  cat("Download it from: https://projects.iq.harvard.edu/bayesmendel/panelpro\n")
  cat("Then run:  renv::install('path/to/PanelPRO_x.y.z.tar.gz')\n")
  cat("\n")
}

# Snapshot whatever is installed so far
renv::snapshot(prompt = FALSE)

cat("Setup complete.\n")
cat("Once PanelPRO is installed, start the sidecar with:  Rscript run.R\n")
