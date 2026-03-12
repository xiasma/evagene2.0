# Start the Plumber sidecar on port 8001.
# Usage:  Rscript run.R
#   or:   Rscript run.R 9000   (custom port)

# Activate renv (Rscript doesn't source .Rprofile by default)
source("renv/activate.R")

args <- commandArgs(trailingOnly = TRUE)
port <- ifelse(length(args) > 0, as.integer(args[1]), 8001L)

library(plumber)

pr <- plumb("plumber.R")

cat(sprintf("Risk analysis sidecar starting on http://localhost:%d\n", port))
pr$run(host = "0.0.0.0", port = port)
