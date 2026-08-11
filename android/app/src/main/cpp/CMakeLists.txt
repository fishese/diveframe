cmake_minimum_required(VERSION 3.22.1)
project(diveframe_dc LANGUAGES C)

set(LIBDIVECOMPUTER_ROOT
    "${CMAKE_CURRENT_SOURCE_DIR}/vendor/libdivecomputer"
)
set(LIBDIVECOMPUTER_SOURCE_MANIFEST
    "${CMAKE_CURRENT_SOURCE_DIR}/libdivecomputer-sources.cmake"
)

if(NOT EXISTS "${LIBDIVECOMPUTER_SOURCE_MANIFEST}")
    message(FATAL_ERROR
        "Pinned libdivecomputer source manifest is missing."
    )
endif()

if(NOT EXISTS "${LIBDIVECOMPUTER_ROOT}/src/version.c")
    message(FATAL_ERROR
        "Pinned libdivecomputer source is missing. "
        "Run scripts/fetch-libdivecomputer.ps1 on Windows or "
        "scripts/fetch-libdivecomputer.sh on Linux/macOS first."
    )
endif()

include("${LIBDIVECOMPUTER_SOURCE_MANIFEST}")

add_library(libdivecomputer SHARED ${LIBDIVECOMPUTER_SOURCES})
target_include_directories(
    libdivecomputer
    PUBLIC "${LIBDIVECOMPUTER_ROOT}/include"
)
target_compile_definitions(
    libdivecomputer
    PRIVATE
        ENABLE_LOGGING
        HAVE_VERSION_SUFFIX
        HAVE_PTHREAD_H
        HAVE_STRERROR_R
        HAVE_CLOCK_GETTIME
        HAVE_LOCALTIME_R
        HAVE_GMTIME_R
        HAVE_TIMEGM
        HAVE_STRUCT_TM_TM_GMTOFF
)

find_library(ANDROID_LOG_LIB log)

add_library(diveframe_dc SHARED diveframe_dc.c)
target_link_libraries(diveframe_dc PRIVATE libdivecomputer ${ANDROID_LOG_LIB})

# libdivecomputer uses __FILE__ in its logging macros. Strip the machine-specific
# checkout path so GitHub and F-Droid produce identical native libraries.
set(DIVEFRAME_REPRODUCIBLE_SOURCE_PATH
    "-ffile-prefix-map=${CMAKE_CURRENT_SOURCE_DIR}=."
)
target_compile_options(
    libdivecomputer PRIVATE ${DIVEFRAME_REPRODUCIBLE_SOURCE_PATH}
)
target_compile_options(
    diveframe_dc PRIVATE ${DIVEFRAME_REPRODUCIBLE_SOURCE_PATH}
)

# lld's generated GNU build ID includes build-path-sensitive input metadata.
# Derive stable, target-specific IDs from the pinned source instead.
file(SHA1
    "${CMAKE_CURRENT_SOURCE_DIR}/libdivecomputer.pin"
    LIBDIVECOMPUTER_BUILD_ID
)
file(SHA1
    "${CMAKE_CURRENT_SOURCE_DIR}/diveframe_dc.c"
    DIVEFRAME_DC_BUILD_ID
)
target_link_options(
    libdivecomputer PRIVATE "-Wl,--build-id=0x${LIBDIVECOMPUTER_BUILD_ID}"
)
target_link_options(
    diveframe_dc PRIVATE "-Wl,--build-id=0x${DIVEFRAME_DC_BUILD_ID}"
)

# Android 15 devices may use 16 KB memory pages, and the loader rejects shared
# libraries whose segments are aligned to the older 4 KB boundary.
set(DIVEFRAME_PAGE_ALIGNMENT
    "-Wl,-z,max-page-size=16384"
    "-Wl,-z,common-page-size=16384"
)
target_link_options(libdivecomputer PRIVATE ${DIVEFRAME_PAGE_ALIGNMENT})
target_link_options(diveframe_dc PRIVATE ${DIVEFRAME_PAGE_ALIGNMENT})
