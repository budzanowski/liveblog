<?php

/**
 * Responsible for querying the Liveblog entries.
 *
 * Much of the work is currently done by WordPress's comments API.
 */
class WPCOM_Liveblog_Entry_Query {

	public function __construct( $post_id, $key ) {
		global $wp_version;
		$this->post_id = $post_id;
		$this->key     = $key;
	}

	/**
	 * Query the database for specific liveblog entries
	 *
	 * @param array $args the same args for the core `get_comments()`.
	 * @return array array of `WPCOM_Liveblog_Entry` objects with the found entries
	 */
	private function get( $args = array() ) {
		$defaults = array(
			'post_id' => $this->post_id,
			'orderby' => 'comment_date_gmt',
			'order'   => 'DESC',
			'type'    => $this->key,
			'status'  => $this->key,
		);

		$args     = wp_parse_args( $args, $defaults );
		$comments = get_comments( $args );

		return self::entries_from_comments( $comments );
	}

	/**
	 * Get all of the liveblog entries
	 *
	 * @param array $args the same args for the core `get_comments()`
	 */
	public function get_all( $args = array() ) {
		//return self::remove_replaced_entries( $this->get( $args ) );
		return $this->get( $args );
	}

	/**
	 * Get key events from liveblog entries
	 *
	 */
	public function get_all_key_events( ) {
		//We want ascending order because we will parse events
		// from the beggining
		$args = array( 'order' => 'ASC' );
		$all_events = $this->get_all( $args );
		if(  empty( $all_events ) ) {
			return array();
		}
		$aggregated = $this->aggregate( $all_events );
		$key_events = array_filter( $aggregated, function( $event ) {
		 	return $event->is_key_event();
		});
		//reverse so the newest will be first
		return array_reverse( $key_events );
	}

	private function aggregate( $all_events ) {
		$aggregated = array();
		foreach( $all_events as $event ) {
			if ( $event->is_new() ) {
				$id = $event->get_id();
				$aggregated[ $id ] = $event;
			} elseif ( $event->is_delete() ) {
				$id = $event->deletes;
				unset( $aggregated[ $id ] );
			} elseif ( $event->is_update() ) {
				$id = $event->replaces;
				$aggregated[ $id ]->set_content( $event->get_content() );
				if( $event->is_key_event() ) {
					$aggregated[ $id ]->set_key_event();
				} else {
					$aggregated[ $id ]->unset_key_event();
				}
			}
		}
		return $aggregated;

	}

	public function get_key_event_by_id( $id ) {
		$all_key_events = $this->get_all_key_events();
		foreach( $all_key_events as $event ) {
			if ( $event->get_id() == $id ) {
				return $event;
			}
		}
		return null;
	}

	public function count( $args = array() ) {
		return count( $this->get_all( $args ) );
	}

	public function get_by_id( $id ) {
		$comment = get_comment( $id );
		if ( $comment->comment_post_ID != $this->post_id || $comment->comment_type != $this->key || $comment->comment_approved != $this->key) {
			return null;
		}
		$entries = self::entries_from_comments( array( $comment ) );
		return $entries[0];
	}

	public function get_latest() {

		$entries = $this->get( array( 'number' => 1 ) );

		if ( empty( $entries ) )
			return null;

		return reset( $entries );
	}

	public function get_latest_timestamp() {

		$latest = $this->get_latest();

		if ( is_null( $latest ) )
			return null;

		if ( ! is_a( $latest, 'WPCOM_Liveblog_Entry' ) )
			return null;

		return $latest->get_timestamp();
	}

	public function get_between_timestamps( $start_timestamp, $end_timestamp ) {
		$entries_between = array();
		$all_entries = $this->get_all_entries_asc();

		foreach ( (array) $all_entries as $entry ) {
			if ( $entry->get_timestamp() >= $start_timestamp && $entry->get_timestamp() <= $end_timestamp ) {
				$entries_between[] = $entry;
			}
		}

		return self::remove_replaced_entries( $entries_between );
	}

	public function has_any() {
		return (bool)$this->get();
	}

	private function get_all_entries_asc() {
		$cached_entries_asc_key =  $this->key . '_entries_asc_' . $this->post_id;
		$cached_entries_asc = wp_cache_get( $cached_entries_asc_key, 'liveblog' );
		if ( false !== $cached_entries_asc ) {
			return $cached_entries_asc;
		}
		$all_entries_asc = $this->get( array( 'order' => 'ASC' ) );
		wp_cache_set( $cached_entries_asc_key, $all_entries_asc, 'liveblog' );
		return $all_entries_asc;
	}

	public static function entries_from_comments( $comments = array() ) {

		if ( empty( $comments ) )
			return null;

		return array_map( array( 'WPCOM_Liveblog_Entry', 'from_comment' ), $comments );
	}

	public static function remove_replaced_entries( $entries = array() ) {

		if ( empty( $entries ) )
			return $entries;

		$entries_by_id = self::assoc_array_by_id( $entries );

		foreach ( (array) $entries_by_id as $id => $entry ) {
			if ( !empty( $entry->replaces ) && isset( $entries_by_id[$entry->replaces] ) ) {
				unset( $entries_by_id[$id] );
			}
		}

		return $entries_by_id;
	}

	public static function assoc_array_by_id( $entries ) {
		$result = array();

		foreach ( (array) $entries as $entry )
			$result[$entry->get_id()] = $entry;

		return $result;
	}

	/**
	 * Returns the Liveblog entries between the two given (optional) timestamps.
	 *
	 * @param int $max_timestamp Maximum timestamp for the Liveblog entries.
	 * @param int $min_timestamp Minimum timestamp for the Liveblog entries.
	 *
	 * @return WPCOM_Liveblog_Entry[]
	 */
	public function get_for_lazyloading( $max_timestamp, $min_timestamp ) {

		$entries = $this->get_all();
		if ( ! $entries ) {
			return array();
		}

		if ( $max_timestamp ) {
			foreach ( $entries as $key => $entry ) {
				$timestamp = $entry->get_timestamp();

				if (
					( $max_timestamp && $timestamp >= $max_timestamp )
					|| ( $min_timestamp && $timestamp <= $min_timestamp )
				) {
					unset( $entries[ $key ] );
				}
			}
		}

		return $entries;
	}
}
