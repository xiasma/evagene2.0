# Evagene Risk Analysis — Plumber API
# Wraps BayesMendel (brcapro / MMRpro / pancpro) for cancer risk calculation.

library(plumber)

# --- Load BayesMendel from extracted source ---

bm_base <- file.path(getwd(), "_src", "BayesMendel")
bm_r    <- file.path(bm_base, "R")
bm_data <- file.path(bm_base, "data")

# Load all data objects (penetrance tables, competing risks, etc.)
for (f in list.files(bm_data, pattern = "\\.rda$", full.names = TRUE)) {
  load(f, envir = .GlobalEnv)
}

# Source all function files (skip plot method — uses S4 generics we don't need)
for (f in sort(list.files(bm_r, pattern = "\\.R$", full.names = TRUE))) {
  if (grepl("plot\\.BayesMendel", basename(f))) next
  tryCatch(
    source(f, local = .GlobalEnv),
    error = function(e) message("  Skip sourcing ", basename(f), ": ", e$message)
  )
}

# Verify core functions loaded
has_brcapro <- exists("brcapro", mode = "function")
has_mmrpro  <- exists("MMRpro", mode = "function")
has_pancpro <- exists("pancpro", mode = "function")

message("BayesMendel loaded: brcapro=", has_brcapro,
        " MMRpro=", has_mmrpro, " pancpro=", has_pancpro)


#* @apiTitle Evagene Risk Analysis
#* @apiDescription Cancer risk analysis sidecar (BayesMendel: brcapro / MMRpro / pancpro)


#* Health check
#* @get /health
function() {
  list(
    status = "ok",
    engine = "BayesMendel",
    models = list(
      brcapro = has_brcapro,
      MMRpro  = has_mmrpro,
      pancpro = has_pancpro
    )
  )
}


#* List available risk models
#* @get /models
function() {
  models <- c()
  if (has_brcapro) models <- c(models, "BRCAPRO")
  if (has_mmrpro)  models <- c(models, "MMRpro")
  if (has_pancpro) models <- c(models, "PancPRO")
  list(models = models)
}


#* Run a cancer risk calculation
#* @post /calculate
#* @param model:str Which model to run (BRCAPRO, MMRpro, or PancPRO)
#* @serializer unboxedJSON
function(req, res, model = "BRCAPRO") {

  body <- req$body
  if (is.null(body)) {
    res$status <- 400L
    return(list(error = "Request body required"))
  }

  members <- body$members
  if (is.null(members) || length(members) == 0) {
    res$status <- 400L
    return(list(error = "members array required"))
  }

  counselee_id <- body$counselee_id
  if (is.null(counselee_id)) counselee_id <- 1L

  allef_type <- body$allef_type
  if (is.null(allef_type)) allef_type <- "nonAJ"

  # Plumber's JSON parser may produce a column-oriented data frame
  # instead of a list-of-lists. Normalize to list-of-lists.
  if (is.data.frame(members)) {
    members <- lapply(seq_len(nrow(members)), function(i) as.list(members[i, , drop = FALSE]))
  }

  tryCatch({
    result <- run_risk_model(members, model, counselee_id, allef_type)
    result
  }, error = function(e) {
    res$status <- 500L
    list(error = paste("Calculation failed:", e$message))
  })
}


# ============================================================
# Internal helpers
# ============================================================

#' Run the specified BayesMendel model.
#'
#' @param members  JSON-decoded list of family members
#' @param model    "BRCAPRO", "MMRpro", or "PancPRO"
#' @param counselee_id  ID of the proband/counselee
#' @param allef_type  Allele frequency population ("nonAJ", "AJ", "Italian")
run_risk_model <- function(members, model, counselee_id, allef_type) {

  model <- toupper(model)

  if (model == "BRCAPRO") {
    fam <- build_brca_family(members)
    result <- brcapro(fam, counselee.id = counselee_id, allef.type = allef_type)

  } else if (model == "MMRPRO") {
    fam <- build_mmr_family(members)
    result <- MMRpro(fam, counselee.id = counselee_id)

  } else if (model == "PANCPRO") {
    fam <- build_panc_family(members)
    result <- pancpro(fam, counselee.id = counselee_id)

  } else {
    stop("Unknown model: ", model, ". Use BRCAPRO, MMRpro, or PancPRO.")
  }

  # Extract results
  format_result(result, model, counselee_id)
}


#' Safe field getter — returns default if NULL or NA.
safe_get <- function(m, field, default = 0L) {
  val <- m[[field]]
  if (is.null(val) || length(val) == 0 || is.na(val)) default else val
}


#' Build a brcapro family data frame.
build_brca_family <- function(members) {
  n <- length(members)
  fam <- data.frame(
    ID       = sapply(members, function(m) as.integer(safe_get(m, "id"))),
    Gender   = sapply(members, function(m) if (safe_get(m, "sex", "Female") == "Male") 1L else 0L),
    FatherID = sapply(members, function(m) as.integer(safe_get(m, "father_id", 0))),
    MotherID = sapply(members, function(m) as.integer(safe_get(m, "mother_id", 0))),
    AffectedBreast = sapply(members, function(m) as.integer(safe_get(m, "affected_breast", 0))),
    AffectedOvary  = sapply(members, function(m) as.integer(safe_get(m, "affected_ovary", 0))),
    AgeBreast = integer(n),
    AgeOvary  = integer(n),
    AgeBreastContralateral = integer(n),
    stringsAsFactors = FALSE
  )

  for (i in seq_len(n)) {
    m <- members[[i]]
    age <- as.integer(safe_get(m, "age", 1))
    ab <- as.integer(safe_get(m, "age_breast", 0))
    ao <- as.integer(safe_get(m, "age_ovary", 0))
    abc <- as.integer(safe_get(m, "age_breast_contralateral", 0))

    fam$AgeBreast[i] <- if (ab > 0) ab else age
    fam$AgeOvary[i]  <- if (ao > 0) ao else age
    fam$AgeBreastContralateral[i] <- abc
  }

  fam
}


#' Build an MMRpro family data frame.
build_mmr_family <- function(members) {
  n <- length(members)
  fam <- data.frame(
    ID       = sapply(members, function(m) as.integer(safe_get(m, "id"))),
    Gender   = sapply(members, function(m) if (safe_get(m, "sex", "Female") == "Male") 1L else 0L),
    FatherID = sapply(members, function(m) as.integer(safe_get(m, "father_id", 0))),
    MotherID = sapply(members, function(m) as.integer(safe_get(m, "mother_id", 0))),
    AffectedColon       = sapply(members, function(m) as.integer(safe_get(m, "affected_colon", 0))),
    AffectedEndometrium = sapply(members, function(m) as.integer(safe_get(m, "affected_endometrium", 0))),
    AgeColon       = integer(n),
    AgeEndometrium = integer(n),
    stringsAsFactors = FALSE
  )

  for (i in seq_len(n)) {
    m <- members[[i]]
    age <- as.integer(safe_get(m, "age", 1))
    ac <- as.integer(safe_get(m, "age_colon", 0))
    ae <- as.integer(safe_get(m, "age_endometrium", 0))

    fam$AgeColon[i]       <- if (ac > 0) ac else age
    fam$AgeEndometrium[i] <- if (ae > 0) ae else age
  }

  fam
}


#' Build a pancpro family data frame.
build_panc_family <- function(members) {
  n <- length(members)
  fam <- data.frame(
    ID       = sapply(members, function(m) as.integer(safe_get(m, "id"))),
    Gender   = sapply(members, function(m) if (safe_get(m, "sex", "Female") == "Male") 1L else 0L),
    FatherID = sapply(members, function(m) as.integer(safe_get(m, "father_id", 0))),
    MotherID = sapply(members, function(m) as.integer(safe_get(m, "mother_id", 0))),
    AffectedPancreas = sapply(members, function(m) as.integer(safe_get(m, "affected_pancreas", 0))),
    AgePancreas = integer(n),
    stringsAsFactors = FALSE
  )

  for (i in seq_len(n)) {
    m <- members[[i]]
    age <- as.integer(safe_get(m, "age", 1))
    ap <- as.integer(safe_get(m, "age_pancreas", 0))

    fam$AgePancreas[i] <- if (ap > 0) ap else age
  }

  fam
}


#' Format BayesMendel result into a clean JSON response.
#' BayesMendel returns an S4 object with slots: family, posterior, probs, predictions, counselee.id
format_result <- function(result, model, counselee_id) {

  probs       <- slot(result, "probs")
  posterior   <- slot(result, "posterior")
  predictions <- slot(result, "predictions")

  out <- list(
    model        = model,
    counselee_id = counselee_id
  )

  # Carrier probabilities (named numeric vector)
  out$carrier_probabilities <- as.list(probs)

  # Posterior genotype probabilities (array -> list of lists)
  if (!is.null(posterior)) {
    # Convert array to a flat named list
    post_df <- as.data.frame(as.table(posterior))
    out$posterior <- post_df
  }

  # Future cancer risk predictions (data frame with age columns)
  if (!is.null(predictions)) {
    out$future_risks <- predictions
  }

  out
}
