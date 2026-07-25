/**
 * Import for side effects: each application registers itself.
 *
 * A registry populated by import rather than by a central list means adding an
 * application touches one file — its own — and forgetting to import it here is
 * the only way to lose one, which the launcher makes immediately obvious.
 */
import "./LauncherApp/LauncherApp";
import "./SourceApp/SourceApp";
import "./PipelineApp/PipelineApp";
import "./EncodingApp/EncodingApp";
import "./ChartApp/ChartApp";
import "./TableApp/TableApp";
import "./ChartsApp/ChartsApp";
import "./GalleryApp/GalleryApp";
import "./CompareApp/CompareApp";
import "./InspectorApp/InspectorApp";
import "./WatchlistApp/WatchlistApp";
import "./TraceApp/TraceApp";
import "./AboutApp/AboutApp";
