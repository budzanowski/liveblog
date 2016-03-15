/* global jQuery, liveblog, liveblog_settings, liveblogLazyloaderSettings */
( function( $, settings ) {
	'use strict';

	var lazyloader = {

		/**
		 * Initializes properties, fetches the first entries, and attaches event handlers.
		 */
		initialize: function() {
			/**
			 * Set callback for events for entries not in DOM that where loaded by
			 * liveblog.get_recent_entries
			 */
			liveblog.lazyloaderHandleEvent = lazyloader.handleFreshEvent;

			lazyloader.entrySets = [];
			lazyloader.EntriesToRender = [];
			lazyloader.EntriesToDelete = [];
			lazyloader.EntriesToUpdate = [];
			lazyloader.nextEntriesIndex = 0;
			lazyloader.consumedEntriesIndex = -1;
			/**
			 * We add one to latest_entry_timestamp to include entry with latest timestamp,
			 * because when we download first chunk we want to have latest entries
			 */
			lazyloader.oldesTimestamp = liveblog_settings.latest_entry_timestamp + 1;

			lazyloader.setBusy();
			lazyloader.fetchEntries( 0 );

			liveblog.$entry_container.on( 'click', '.liveblog-load-more', lazyloader.clickLoadMoreButton );

			if ( liveblog.$key_entry_container.length ) {
				liveblog.$key_entry_container.on( 'click', 'a', lazyloader.clickKeyEventLink );
			}

		},

		/**
		 * Sets the internal busy state, and disables the load more buttons.
		 */
		setBusy: function() {
			liveblog.$entry_container.find( '.liveblog-load-more' ).attr( 'disabled', 'disabled' );

			lazyloader.busy = true;
		},

		/**
		 * Unsets the internal busy state, and enables the load more buttons.
		 */
		setUnbusy: function() {
			lazyloader.busy = false;

			liveblog.$entry_container.find( '.liveblog-load-more' ).removeAttr( 'disabled' );
		},

		/**
		 * Returns the inernal busy state.
		 * @returns {boolean}
		 */
		isBusy: function() {
			return lazyloader.busy;
		},

		/**
		 * Fetches the next entries for the entry set with the given index.
		 * This is a recursive call. It will send as many requests as needed to
		 * get minimal number of entries that can be displayed
		 * @param {number} [setIndex=0] - The index of an entry set.
		 */
		fetchEntries: function( setIndex ) {
			setIndex = setIndex || 0;

			// Instantiate now to avoid a collision after the AJAX request.
			lazyloader.entrySets[ setIndex ] = [];

			var $button = lazyloader.getButton( setIndex );
			if ( ! $button.length ) {
				return;
			}

			var $previousEntry = $button.prev( '.liveblog-entry' ),
				maxTimestamp = lazyloader.oldesTimestamp,
				minTimestamp = 0,
				url = liveblog_settings.endpoint_url + 'lazyload/';

			if ( maxTimestamp || minTimestamp ) {
				url = url + maxTimestamp + '/' + minTimestamp + '/';
			}

			var data = {
				index: setIndex
			};
			$.get( url, data, function( response ) {
				var index = response.index;

				var $button = lazyloader.getButton( index );

				if ( ! response.entries || ! response.entries.length ) {
					$button.remove();
					lazyloader.setUnbusy();
					lazyloader.displayForTheFirstTime()
				} else {
					$button.blur();
					lazyloader.oldesTimestamp =
						$( response.entries[ response.entries.length - 1 ].html ).data( 'timestamp' );
					lazyloader.splitEntriesOnType( response.entries );
					lazyloader.updateAndDeleteEntriesToRender();

					var availableEntries = lazyloader.EntriesToRender.length -
						( lazyloader.consumedEntriesIndex + 1 );
					if ( availableEntries >= settings.numberOfEntries ) {
						lazyloader.setUnbusy();
						lazyloader.displayForTheFirstTime();
					} else {
						lazyloader.fetchEntries( index );
					}
				}

			} );
		},

		displayForTheFirstTime: function() {
			if ( lazyloader.consumedEntriesIndex == -1 && lazyloader.EntriesToRender.length ) {
					lazyloader.renderEntries( 0 );
			}
		},

		splitEntriesOnType: function( entries ) {
			$.each( entries, function( i, entry ) {
				switch( entry.type ) {
					case 'new':
						lazyloader.EntriesToRender.push( entry );
						break;
					case 'update':
						lazyloader.EntriesToUpdate.push( entry );
						break;
					case 'delete':
						lazyloader.EntriesToDelete.push( entry );
					default:
						break;
				}
			} );
		},

		updateAndDeleteEntriesToRender: function() {
			lazyloader.updateEntries();
			lazyloader.deleteEntries();
		},

		updateEntries: function() {
			for( var i = 0; i < lazyloader.EntriesToRender.length; i++ ) {
				var entry = lazyloader.EntriesToRender[ i ];
				for( var j = 0; j < lazyloader.EntriesToUpdate.length; j++ ) {
					var update = lazyloader.EntriesToUpdate[ j ];
					if ( entry.id == update.id ) {
						lazyloader.updateEntry( entry, update );
						delete lazyloader.EntriesToUpdate[ j ];
					}
				}
				//Remove used entries
				lazyloader.EntriesToUpdate = lazyloader.EntriesToUpdate.filter( function() { return true; } );
			}
		},

		updateEntry: function( entry, update ) {
			entry.html = update.html;
		},

		deleteEntries: function() {
			for( var i = 0; i < lazyloader.EntriesToRender.length; i++ ) {
				var entry = lazyloader.EntriesToRender[ i ];
				for( var j = 0; j < lazyloader.EntriesToDelete.length; j++ ) {
					var delete_entry = lazyloader.EntriesToDelete[ j ];
					if ( entry.id == delete_entry.id ) {
						delete lazyloader.EntriesToDelete[ j ];
						delete lazyloader.EntriesToRender[ i ];
					}
				}
				//Remove used entries empty space
				lazyloader.EntriesToDelete = lazyloader.EntriesToDelete.filter( function() { return true; } );
			}
			//Remove deleted entries empty space
			lazyloader.EntriesToRender = lazyloader.EntriesToRender.filter( function() { return true; } );
		},

		/**
		 * Handles fresh events loaded by liveblog.js that are targeting events
		 * not yet downloaded by lazyloader.
		 * @param {event} entry - update or delete event to handle
		 */
		handleFreshEvent: function( entry ) {
			lazyloader.splitEntriesOnType( [entry] );
			lazyloader.updateAndDeleteEntriesToRender();
		},

		/**
		 * Returns the button with the given entry set index.
		 * @param {number} index - The index of an entry set.
		 * @returns {HTMLElement} - The button HTML element.
		 */
		getButton: function( index ) {
			return liveblog.$entry_container.find( '.liveblog-load-more[data-set-index="' + index + '"]' );
		},

		/**
		 * Triggers rendering of the according entries.
		 */
		clickLoadMoreButton: function() {
			lazyloader.setBusy();

			lazyloader.renderEntries( $( this ).data( 'set-index' ) );
		},

		/**
		 * Renders the entries in the entry set with the given ID, and fetches new entries for it.
		 * @param {number} setIndex - The index of an entry set.
		 */
		renderEntries: function( setIndex ) {
			var $button = lazyloader.getButton( setIndex );
			if ( ! $button.length ) {
				return;
			}

			var nextEntry = lazyloader.consumedEntriesIndex + 1;

			for(var i = nextEntry; i < lazyloader.EntriesToRender.length; i++) {
				var entry = lazyloader.EntriesToRender[ i ];
				$button.before( $( entry.html ) );
				lazyloader.consumedEntriesIndex += 1;
			}

			// Convert the timestamps of the newly inserted entries into human time diffed timestamps.
			liveblog.entriesContainer.updateTimes();

			lazyloader.fetchEntries( setIndex );
		},

		/**
		 * Fetches the entry for the according Key Event, if necessary, and renders it.
		 * @param {event} e - The event.
		 */
		clickKeyEventLink: function( e ) {
			if ( lazyloader.isBusy() ) {
				e.preventDefault();

				return;
			}

			var $this = $( this );

			if ( $( $this.attr( 'href' ) ).length ) {

				// The according element is already in the DOM, so there's nothing to do.
				return;
			}

			lazyloader.setBusy();

			var entryID = $this.data( 'entry-id' );

			var setIndex = lazyloader.findEntrySet( entryID );
			if ( setIndex >= 0 ) {
				lazyloader.renderEntries( setIndex );
			} else {

				// The according entry could not be found in the entry sets, so fetch it first.
				lazyloader.fetchAndRenderKeyEventEntry( entryID );
			}
		},

		/**
		 * Returns the index of the entry set that contains the entry with the given ID.
		 * @param {number} entryID - The ID of an entry.
		 * @returns {number} - The index of the entry set that contains the entry with the given ID.
		 */
		findEntrySet: function( entryID ) {
			var foundIndex = -1;

			$.each( lazyloader.entrySets, function( setIndex, entries ) {
				var entryIndex = lazyloader.findEntry( entryID, entries );
				if ( entryIndex >= 0 ) {
					foundIndex = ( 0 === entryIndex ) ? setIndex : lazyloader.splitEntrySet( setIndex, entryIndex );

					// Leave the loop.
					return false;
				}
			} );

			return foundIndex;
		},

		/**
		 * Returns the index of the entry with the given ID in the given entries.
		 * @param {number} entryID - The ID of the entry that is to be found.
		 * @param {Object[]} entries - The entry objects that are searched for the entry with the given ID.
		 * @param {string} entries[].id - The ID of the entry.
		 * @returns {number} - The index of the entry that is to be found.
		 */
		findEntry: function( entryID, entries ) {
			var foundIndex = -1;

			$.each( entries, function( entryIndex, entry ) {
				if ( entry.id == entryID ) {
					foundIndex = entryIndex;

					// Leave the loop.
					return false;
				}
			} );

			return foundIndex;
		},

		/**
		 * Splits the entry set with the given index at the given entry index.
		 * @param {number} setIndex - The index of the entry set that is to be split.
		 * @param {number} entryIndex - The index of the entry where the entry set is to be split at.
		 * @returns {number} - The new entry set index.
		 */
		splitEntrySet: function( setIndex, entryIndex ) {
			var newSetIndex = lazyloader.entrySets.length;

			lazyloader.entrySets[ newSetIndex ] = lazyloader.entrySets[ setIndex ].slice( entryIndex );
			lazyloader.entrySets[ setIndex ] = lazyloader.entrySets[ setIndex ].slice( 0, entryIndex );

			var $button = lazyloader.getButton( setIndex );
			if ( $button.length ) {
				$button.after( lazyloader.createButton( newSetIndex ) );
			}

			return newSetIndex;
		},

		/**
		 * Returns a newly created button for the given entry set index.
		 * @param {number} index - The index of the entry set for which the button is to be created.
		 * @returns {HTMLElement} - The button HTML element.
		 */
		createButton: function( index ) {
			var $button = $( '<button />' );
			$button.addClass( 'liveblog-load-more' ).attr( 'data-set-index', index ).text( settings.loadMoreText );

			return $button;
		},

		/**
		 * Fetches and renders the Key Event entry with the given ID.
		 * @param {number} entryID - The ID of the Key Event entry that is to be rendered.
		 */
		fetchAndRenderKeyEventEntry: function( entryID ) {
			var newSetIndex = lazyloader.entrySets.length;

			// Instantiate now to avoid a collision after the AJAX request.
			lazyloader.entrySets[ newSetIndex ] = [];

			var data = {
				index: newSetIndex
			};
			$.get( liveblog_settings.endpoint_url + 'entry/' + entryID, data, function( response ) {
				if ( ! response.entries ) {
					return;
				}

				var index = response.index;

				lazyloader.entrySets[ index ] = response.entries;

				lazyloader.insertKeyEventButton( index, response.previousTimestamp, response.nextTimestamp );

				lazyloader.renderEntries( index );

				$( 'html, body' ).animate( {
					scrollTop: $( window.location.hash ).offset().top
				}, 200 );
			} );
		},

		/**
		 * Creates a new button and inserts it at the correct location into the DOM wrt. the given timestamps.
		 * @param {number} index - The index of an entry set.
		 * @param {number} previousTimestamp - The timestamp of the entry immediately before the Key Event entry.
		 * @param {number} nextTimestamp - The timestamp of the entry immediately after the Key Event entry.
		 */
		insertKeyEventButton: function( index, previousTimestamp, nextTimestamp ) {
			var $button;

			liveblog.$entry_container.find( '.liveblog-load-more' ).each( function() {
				var $this = $( this ),
					$previousEntry = $this.prev( '.liveblog-entry' ),
					$nextEntry = $this.next( '.liveblog-entry' );

				if (
					$previousEntry.data( 'timestamp' ) >= nextTimestamp
					&& ( ! $nextEntry.length || $nextEntry.data( 'timestamp' ) <= previousTimestamp )
				) {
					$button = $this;

					// Leave the loop.
					return false;
				}
			} );

			if ( $button && $button.length ) {
				$button.after( lazyloader.createButton( index ) );
			}
		}
	};

	$( lazyloader.initialize );

} )( jQuery, liveblogLazyloaderSettings );
