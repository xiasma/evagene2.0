# Extract BayesMendel and kinship source from R 2.8.1 binary packages.
# Run once to populate _src/. Then plumber.R sources from there.

extract_pkg <- function(pkg_name, from_dir, to_dir) {
  rdb <- file.path(from_dir, pkg_name, "R", pkg_name)
  out_r <- file.path(to_dir, pkg_name, "R")
  out_data <- file.path(to_dir, pkg_name, "data")
  dir.create(out_r, recursive = TRUE, showWarnings = FALSE)
  dir.create(out_data, recursive = TRUE, showWarnings = FALSE)

  # Copy DESCRIPTION, NAMESPACE
  for (f in c("DESCRIPTION", "NAMESPACE")) {
    src <- file.path(from_dir, pkg_name, f)
    if (file.exists(src)) file.copy(src, file.path(to_dir, pkg_name), overwrite = TRUE)
  }

  e <- new.env()
  lazyLoad(rdb, envir = e)
  objs <- ls(e, all.names = FALSE)  # skip internal .__ objects
  cat(pkg_name, ":", length(objs), "objects\n")

  for (nm in objs) {
    # Sanitize filename (operators like %*% can't be filenames)
    safe_name <- gsub("[%*?<>|\":/\\\\]", "_", nm)
    obj <- get(nm, envir = e)
    if (is.function(obj)) {
      lines <- tryCatch(deparse(obj, control = "all"), error = function(e) NULL)
      if (!is.null(lines)) {
        # Quote names that need it
        lhs <- if (grepl("^[a-zA-Z._][a-zA-Z0-9._]*$", nm)) nm else paste0("`", nm, "`")
        writeLines(c(paste0(lhs, " <-"), lines), file.path(out_r, paste0(safe_name, ".R")))
      }
    } else {
      tryCatch({
        save(list = nm, envir = e, file = file.path(out_data, paste0(safe_name, ".rda")))
      }, error = function(err) {
        cat("  Skipped data:", nm, "-", err$message, "\n")
      })
    }
  }
}

src_dir <- "D:/dev/evagene/risk/_rebuild"
out_dir <- "D:/dev/evagene/risk/_src"

cat("Extracting BayesMendel...\n")
extract_pkg("BayesMendel", src_dir, out_dir)

cat("Extracting kinship...\n")
extract_pkg("kinship", src_dir, out_dir)

cat("\nDone. Source in:", out_dir, "\n")
